const { findButton } = require('../scripts/packaged-ui') as {
  findButton: (name: string, selector?: string) => HTMLButtonElement | null;
};

describe('packaged UI button lookup', () => {
  afterEach(() => { document.body.innerHTML = ''; });
  it('finds the search button by its accessible name despite the shortcut hint', () => {
    document.body.innerHTML = '<button aria-label="Find tasks"><span>Find tasks</span><kbd>Ctrl K</kbd></button>';
    expect(findButton('Find tasks')).toBe(document.querySelector('button'));
  });
  it('finds an icon-only or renamed visible control by aria-label', () => {
    document.body.innerHTML = '<button aria-label="Config Habits"><span>Habits</span></button>';
    expect(findButton('Config Habits')).toBe(document.querySelector('button'));
  });
  it('resolves aria-labelledby and normalizes whitespace', () => {
    document.body.innerHTML = '<span id="a"> Start </span><span id="b"> focus </span><button aria-labelledby="a b">Icon</button>';
    expect(findButton('Start focus')).toBe(document.querySelector('button'));
  });
  it('matches exact text when no accessible name override exists', () => {
    document.body.innerHTML = '<button>  Start  focus  </button><button>Start focus later</button>';
    expect(findButton('Start focus')).toBe(document.querySelector('button'));
    expect(findButton('Start')).toBeNull();
  });
  it('does not use visible text over an explicit different accessible name', () => {
    document.body.innerHTML = '<button aria-label="Stop focus">Start focus</button>';
    expect(findButton('Start focus')).toBeNull();
  });
  it('ignores disabled and hidden controls, including hidden ancestors', () => {
    document.body.innerHTML = '<button disabled>Search</button><button hidden>Search</button><div style="display:none"><button>Search</button></div><div style="visibility:hidden"><button>Search</button></div><div aria-hidden="true"><button>Search</button></div><div inert><button>Search</button></div><button id="visible">Search</button>';
    expect(findButton('Search')?.id).toBe('visible');
  });
  it('rejects ambiguous visible matches and supports dialog scope', () => {
    document.body.innerHTML = '<button>Cancel</button><div role="dialog"><button>Cancel</button></div>';
    expect(() => findButton('Cancel')).toThrow(/Ambiguous/);
    expect(findButton('Cancel', '[role="dialog"] button')).toBe(document.querySelector('[role="dialog"] button'));
  });
  it('works when serialized into the renderer as the CDP suite does', () => {
    document.body.innerHTML = '<button aria-label="Find tasks">Find tasks<kbd>Ctrl K</kbd></button>';
    const lookup = new Function(`return (${findButton.toString()})('Find tasks')`);
    expect(lookup()).toBe(document.querySelector('button'));
  });
});
