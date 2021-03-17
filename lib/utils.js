'use strict';

const typedefs = require('../typedefs');
const { format } = require('util');

module.exports = {
  interpolate,
  positionalBinds,
  generateGUID,
  generateLogger
};

/**
 * @see typedefs.SQLERInterpolateFunction
 * @private
 */
function interpolate(dest, source, interpolator, validator, onlyInterpolated, _vpths) {
  let val, typ, vfunc = typeof validator === 'function' && validator, pole = interpolator || dest, isPole;
  for (let srcProp in source) {
    if (!source.hasOwnProperty(srcProp)) continue;
    isPole = false;
    typ = typeof source[srcProp];
    if (typ === 'object' && !(source[srcProp] instanceof Date) && !(source[srcProp] instanceof RegExp)) {
      if (_vpths) _vpths.push(srcProp);
      else if (vfunc) _vpths = [srcProp];
      dest[srcProp] = interpolate(source[srcProp], source[srcProp], interpolator, validator, onlyInterpolated, _vpths);
      if (_vpths) _vpths.shift();
      continue;
    }
    if (typ === 'string') {
      // actual interpolation
      val = undefined;
      source[srcProp].replace(/\${\s*([A-Z_]+)\s*}/i, (match, interpolated) => {
        if (interpolated in pole) {
          isPole = true;
          val = pole[interpolated];
        } else {
          val = match; // leave as is
        }
      });
      if (typeof val === 'undefined') {
        val = source[srcProp];
      }
    } else {
      val = source[srcProp];
    }
    if (vfunc) {
      if (_vpths) _vpths.push(srcProp);
      else _vpths = [srcProp];
      if (!vfunc(_vpths, val)) {
        _vpths.pop();
        continue;
      }
    }
    if (!onlyInterpolated || isPole) dest[srcProp] = val;
    if (_vpths) _vpths.pop();
  }
  return dest;
}

/**
 * @see typedefs.SQLERPositionalBindsFunction
 * @private
 */
function positionalBinds(sql, bindsObject, bindsArray, placeholder = '?') {
  const func = typeof placeholder === 'function' ? placeholder : null;
  return sql.replace(typedefs.POS_BINDS_REGEXP, (match, pname) => {
    if (!bindsObject.hasOwnProperty(pname)) throw new Error(`sqler: Unbound "${pname}" at position ${
      bindsArray.length
    } found during positional bind formatting`);
    bindsArray.push(bindsObject[pname]);
    return func ? func(pname, bindsArray.length - 1) : placeholder;
  });
}

/**
 * Generates formats a GUID formatted identifier
 * @private
 * @param {String} [value] when present, will add any missing hyphens (if `hyphenate=true`) instead of generating a new value
 * @param {Boolean} [hyphenate=true] true to include hyphens in generated result
 * @returns {String} the generated GUID formatted identifier
 */
function generateGUID(value, hyphenate = true) {
  const hyp = hyphenate ? '-' : '';
  if (value) return hyphenate ? value.replace(/(.{8})-?(.{4})-?(.{4})-?(.{4})-?(.{12})/gi, `$1${hyp}$2${hyp}$3${hyp}$4${hyp}$5`) : value;
  return `xxxxxxxx${hyp}xxxx${hyp}4xxx${hyp}yxxx${hyp}xxxxxxxxxxxx`.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Generate a {@link Manager} _logger_
 * @private
 * @param {Function} log The `function(...args)` that will log out the arguments
 * @param {Sring[]} [tags] The tags that will prefix the log output
 */
function generateLogger(log, tags) {
  return function dbManagerLogger(o) {
    const logs = typeof o === 'string' ? [format.apply(null, arguments)] : arguments;
    for (let i = 0, l = logs.length; i < l; ++i) {
      log(`[${tags ? tags.join() : ''}] ${logs[i]}`);
    }
  };
}