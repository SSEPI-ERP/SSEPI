(function() {
  function patchCTA() {
    var keywords = ['contáctanos','contacto','acceder','login','acceso','entrar','iniciar','empezar','ver más','saber más'];
    var links = document.querySelectorAll('a, button');
    for (var i = 0; i < links.length; i++) {
      var el = links[i];
      var text = (el.textContent || el.innerText || '').toLowerCase().trim();
      for (var k = 0; k < keywords.length; k++) {
        if (text.indexOf(keywords[k]) !== -1) {
          el.href = '/panel/login.html';
          el.onclick = null;
          el.target = '_self';
          console.log('[Landing Patch] CTA vinculado a login:', text);
          return;
        }
      }
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(patchCTA, 800); });
  } else {
    setTimeout(patchCTA, 800);
  }
  setTimeout(patchCTA, 2000);
})();
