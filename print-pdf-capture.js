/* Client-side print-accurate PDF capture.
 *
 * Builds the same standalone print document as the existing share-report
 * feature (all <style> text with @media print rules un-scoped so they apply
 * on screen), renders it in a hidden same-origin iframe, rasterises each
 * printed page with html2canvas and assembles an A4 PDF with jsPDF - the
 * Ball Penetration section on a landscape page, everything else portrait.
 *
 * Exposed as window.LotPackPrintPdf.capture() -> Promise<base64 string|null>.
 * Never throws: any failure resolves null so the submission proceeds and the
 * server falls back to its own generated PDF.
 */
(function(){
  'use strict';

  var MM_PER_PX = 25.4 / 96;
  var PAGE = { pW:210, pH:297, margin:8 };
  var CAPTURE_SCALE = 1.6;
  var MAX_BASE64 = 12 * 1024 * 1024;

  function unscopePrintMedia(cssText){
    var re = /@media[^{]*\bprint\b[^{]*\{/g;
    var out = '';
    var i = 0;
    var m;
    while((m = re.exec(cssText))){
      out += cssText.slice(i, m.index);
      var start = re.lastIndex;
      var depth = 1;
      var j = start;
      while(j < cssText.length && depth > 0){
        if(cssText[j] === '{') depth++;
        else if(cssText[j] === '}') depth--;
        j++;
      }
      out += cssText.slice(start, j - 1);
      i = j;
      re.lastIndex = i;
    }
    out += cssText.slice(i);
    return out;
  }

  function syncPrintDom(){
    ['v113SyncPrint','syncPrintDiagramV101','v33FillSiteDiagramPrintPage','syncQvcPrint','syncIncludedPrint','syncLotNotesPrint','syncMixPrint'].forEach(function(fn){
      try{ if(typeof window[fn] === 'function') window[fn](); }catch(_e){}
    });
  }

  function buildDocHtml(){
    var report = document.querySelector('.print-report');
    if(!report) return null;
    syncPrintDom();
    var raw = Array.prototype.map.call(document.querySelectorAll('style'), function(s){ return s.textContent; }).join('\n');
    var styles = unscopePrintMedia(raw);
    return '<!doctype html><html><head><meta charset="utf-8"><style>' + styles + '</style>'
      + '<style>html,body{background:#fff!important;margin:0!important;padding:0!important;overflow:visible!important}'
      + '.print-report{margin:0!important}</style>'
      + '</head><body>' + report.outerHTML + '</body></html>';
  }

  function loadIframe(html){
    return new Promise(function(resolve, reject){
      var f = document.createElement('iframe');
      f.setAttribute('aria-hidden','true');
      f.style.cssText = 'position:fixed;left:-12000px;top:0;width:1200px;height:900px;border:0;visibility:hidden';
      var deadline = Date.now() + 15000;
      function ready(){
        var doc = f.contentDocument;
        if(doc && doc.querySelector('.print-report')){ resolve(f); return; }
        if(Date.now() > deadline){ reject(new Error('iframe load timeout')); return; }
        setTimeout(ready, 100);
      }
      f.srcdoc = html;
      document.body.appendChild(f);
      setTimeout(ready, 50);
    });
  }

  function waitForImages(doc){
    var pending = Array.prototype.filter.call(doc.images, function(img){ return !img.complete; });
    return Promise.all(pending.map(function(img){
      return new Promise(function(r){ img.onload = img.onerror = r; setTimeout(r, 8000); });
    })).then(function(){ return new Promise(function(r){ setTimeout(r, 200); }); });
  }

  function pageSegments(doc){
    var report = doc.querySelector('.print-report');
    if(!report) return [];
    var win = doc.defaultView;
    var segs = [];
    var cur = null;
    Array.prototype.forEach.call(report.children, function(el){
      var cs = win.getComputedStyle(el);
      if(cs.display === 'none') return;
      var isLandscape = el.classList.contains('ballpen-landscape');
      var brk = String(cs.breakBefore || '') + ' ' + String(cs.pageBreakBefore || '');
      var startsPage = isLandscape || !cur || /\b(page|always|left|right)\b/.test(brk);
      if(startsPage){
        cur = { landscape:isLandscape, els:[] };
        segs.push(cur);
      }
      cur.els.push(el);
      if(isLandscape) cur = null;
    });
    return segs.filter(function(s){ return s.els.length; });
  }

  function captureSegment(doc, seg){
    var wrap = doc.createElement('div');
    var innerWmm = (seg.landscape ? PAGE.pH : PAGE.pW) - 2 * PAGE.margin;
    wrap.style.cssText = 'width:' + innerWmm + 'mm!important;max-width:none!important;margin:0!important;padding:0!important;background:#fff';
    seg.els[0].parentNode.insertBefore(wrap, seg.els[0]);
    seg.els.forEach(function(el){ wrap.appendChild(el); });
    // Collect safe cut positions (block boundaries, CSS px from wrapper top)
    // so page slicing never cuts through the middle of a table or signature.
    var wrapTop = wrap.getBoundingClientRect().top;
    var cuts = [];
    function collect(node, depth){
      Array.prototype.forEach.call(node.children, function(child){
        var r = child.getBoundingClientRect();
        if(r.height < 8) return;
        cuts.push(r.top - wrapTop);
        // Only look inside a block for cut points when it cannot possibly
        // fit on one page by itself; otherwise the whole block moves intact.
        if(depth < 2 && r.height > 1050) collect(child, depth + 1);
      });
    }
    collect(wrap, 0);
    seg.cutPoints = cuts.sort(function(a,b){ return a-b; });
    return window.html2canvas(wrap, {
      scale: CAPTURE_SCALE,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
      windowWidth: doc.documentElement.scrollWidth,
      windowHeight: doc.documentElement.scrollHeight
    });
  }

  function addCanvasToPdf(pdf, canvas, seg, isFirstPage){
    var innerWmm = (seg.landscape ? PAGE.pH : PAGE.pW) - 2 * PAGE.margin;
    var innerHmm = (seg.landscape ? PAGE.pW : PAGE.pH) - 2 * PAGE.margin;
    var pxPerMm = canvas.width / innerWmm;
    var chunkPx = Math.floor(innerHmm * pxPerMm);
    var scale = canvas.width / ((seg.landscape ? PAGE.pH : PAGE.pW) - 2 * PAGE.margin) * MM_PER_PX; // canvas px per CSS px
    var cutsPx = (seg.cutPoints || []).map(function(c){ return Math.round(c * scale); });
    var y = 0;
    var first = isFirstPage;
    while(y < canvas.height){
      var h = Math.min(chunkPx, canvas.height - y);
      if(h < 4) break;
      if(y + h < canvas.height - 4){
        // not the last slice: prefer ending the page on a block boundary
        var best = -1;
        for(var c = 0; c < cutsPx.length; c++){
          var rel = cutsPx[c] - y;
          if(rel > h * 0.45 && rel <= h && rel > best) best = rel;
        }
        if(best > 0) h = best;
      }
      var slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = h;
      slice.getContext('2d').drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if(!first) pdf.addPage('a4', seg.landscape ? 'landscape' : 'portrait');
      first = false;
      pdf.addImage(slice.toDataURL('image/jpeg', 0.9), 'JPEG', PAGE.margin, PAGE.margin, innerWmm, h / pxPerMm);
      y += h;
    }
    return first;
  }

  async function capture(){
    var iframe = null;
    try{
      if(!window.html2canvas || !window.jspdf || !window.jspdf.jsPDF) return null;
      var html = buildDocHtml();
      if(!html) return null;
      iframe = await loadIframe(html);
      var doc = iframe.contentDocument;
      await waitForImages(doc);
      var segs = pageSegments(doc);
      if(!segs.length) return null;

      var pdf = new window.jspdf.jsPDF({
        unit: 'mm',
        format: 'a4',
        orientation: segs[0].landscape ? 'landscape' : 'portrait',
        compress: true
      });
      var firstPage = true;
      for(var i = 0; i < segs.length; i++){
        var canvas = await captureSegment(doc, segs[i]);
        firstPage = addCanvasToPdf(pdf, canvas, segs[i], firstPage);
      }
      if(firstPage) return null;

      var dataUri = pdf.output('datauristring');
      var base64 = dataUri.split(',')[1] || '';
      if(!base64 || base64.length > MAX_BASE64) return null;
      return base64;
    }catch(error){
      try{ console.warn('[print-pdf] capture failed; server fallback will be used', error); }catch(_e){}
      return null;
    }finally{
      if(iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }
  }

  window.LotPackPrintPdf = { capture: capture };
})();
