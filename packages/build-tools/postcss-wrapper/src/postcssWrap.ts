import postcss from 'postcss';
import objectAssign from 'object-assign';
import escapeStringRegexp from 'escape-string-regexp';

const CSS_ESCAPED_TAB = '\\9';
const RE_VAR = /(--(.+))/;

export const normalizeId = (id: string) => {
  return id.replace(/@/g, '').replace(/\./g, '').replace(/\//g, '').replace(/-/g, '');
}

export const normalizeFontName = (id: string) => {
  return id.replace(/["']/g, '')
}

interface IOptions {
  // The number of times `:not(#\\9)` is appended in front of the selector
  repeat: number;
  // Whether to add !important to declarations in rules with id selectors
  overrideIds: boolean;
  // The thing we repeat over and over to make up the piece that increases specificity
  stackableRoot: string;
}

function increaseSpecifityOfRule(rule: postcss.Rule, opts: IOptions, cachedIconName: Record<string, boolean>) {
  rule.selectors = rule.selectors.map(function(selector: string) {
    // Apply it to the selector itself if the selector is a `root` level component
    // `html:not(#\\9):not(#\\9):not(#\\9)`
    if (['from', 'to'].indexOf(selector) !== -1) {
      return selector;
    }

    if(
      selector === 'html' ||
      selector === ':root' ||
      selector === ':host' ||
      selector === opts.stackableRoot
    ) {
      return opts.stackableRoot.repeat(opts.repeat);
    }

    // Otherwise just make it a descendant (this is what will happen most of the time)
    // `:not(#\\9):not(#\\9):not(#\\9) .foo`
    return opts.stackableRoot.repeat(opts.repeat) + ' ' + selector;
  });

  rule.walkDecls('font-family', function(decl) {
    const fontName = normalizeFontName(decl.value);
    if (cachedIconName[fontName]) {
      decl.value = `${normalizeId(opts.stackableRoot)}${fontName}`;
    }
  });

  if(opts.overrideIds) {
    if(
      // If an id is in there somewhere
      (new RegExp('#(?!' + escapeStringRegexp(CSS_ESCAPED_TAB) + ')')).test(rule.selector) ||
      // Or it is an attribute selector with an id
      (/\[id/).test(rule.selector)
    ) {
      rule.walkDecls(function(decl) {
        decl.important = true;
      });
    }
  }
}

const defaultOptions = {
  // The number of times `:not(#\\9)` is appended in front of the selector
  repeat: 3,
  // Whether to add !important to declarations in rules with id selectors
  overrideIds: true,
  // The thing we repeat over and over to make up the piece that increases specificity
  stackableRoot: ':not(#' + CSS_ESCAPED_TAB + ')'
};

// Plugin that adds `:not(#\\9)` selectors to the front of the rule thus increasing specificity
export const postcssWrap = postcss.plugin('postcss-css-wrapper', function(options: IOptions | undefined) {

  const opts = objectAssign({}, defaultOptions, options);
  const cachedIconName: Record<string, boolean> = {}

  return function(css: postcss.Root) {
    css.walkAtRules('font-face', (rule: postcss.AtRule) => {
      rule.walkDecls('font-family', function(decl) {
        const fontName = normalizeFontName(decl.value);
        cachedIconName[fontName] = true;
        decl.value = `${normalizeId(opts.stackableRoot)}${fontName}`;
      });
    });

    css.walkDecls(function(decl) {
      if (RE_VAR.test(decl.prop) && decl.prop.indexOf('font-family') !== -1) {
        const fontName = normalizeFontName(decl.value);
        if (cachedIconName[fontName]) {
          decl.value = `${normalizeId(opts.stackableRoot)}${fontName}`;
        }
      }
    })

    css.walkRules(function(rule: postcss.Rule) {
      // Avoid adding additional selectors (stackableRoot) to descendant rules of @keyframe {}
      // i.e. `from`, `to`, or `{number}%`
      // console.log(rule.parent.name)
      var isInsideKeyframes = rule.parent.type === 'atrule' && rule.parent.name.indexOf('keyframes') !== -1;

      if(!isInsideKeyframes) {
        increaseSpecifityOfRule(rule, opts, cachedIconName);
      }
    });
  };
});