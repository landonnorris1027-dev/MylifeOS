// Serialized into the packaged renderer by regression-packaged.js.
// Keep this function self-contained: no Node APIs or module-scope dependencies.
function findButton(name, selector = 'button') {
  const normalize = value => (value || '').replace(/\s+/g, ' ').trim();
  const matches = Array.from(document.querySelectorAll(selector)).filter(button => {
    if (button.matches(':disabled') || button.getAttribute('aria-disabled') === 'true') return false;
    for (let element = button; element; element = element.parentElement) {
      const style = window.getComputedStyle(element);
      if (element.hidden || element.hasAttribute('inert') || element.getAttribute('aria-hidden') === 'true'
        || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    }
    const labelledBy = button.getAttribute('aria-labelledby');
    const references = labelledBy?.split(/\s+/).map(id => document.getElementById(id)).filter(Boolean);
    const label = references?.length ? references.map(element => element.textContent).join(' ')
      : button.getAttribute('aria-label') || button.innerText || button.textContent;
    return normalize(label) === normalize(name);
  });
  if (matches.length > 1) throw new Error(`Ambiguous button: ${name} (${matches.length} matches in ${selector})`);
  return matches[0] || null;
}
module.exports = { findButton };
