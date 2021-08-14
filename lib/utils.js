'use strict';

const typedefs = require('../typedefs');
const Stream = require('stream');
const { format } = require('util');

module.exports = {
  interpolate,
  positionalBinds,
  bindExpansions,
  readable,
  writable,
  generateGUID,
  generateLogger
};

/**
 * @type {typedefs.SQLERStreamReadableProcessor}
 * @private
 */
function readable(opts, readStream, reader) {
  if (!(readStream instanceof Stream.Readable)) {
    throw new TypeError(`Readable must be a readable stream, but found ${JSON.stringify(readStream)}`);
  }
  const batch = [];
  readStream.on('data', async (chunk) => {
    batch.push(chunk);
    if (batch.length >= opts.stream) {
      await emitBatch(readStream, reader, batch);
    }
  });
  if (opts.stream > 0) {
    readStream.on('close', async function() {
      if (batch.length) {
        await emitBatch(readStream, reader, batch);
      }
    });
  }
  return readStream;
}

/**
 * @type {typedefs.SQLERStreamWritable}
 * @private
 */
function writable(opts, writter) {
  if (typeof writter !== 'function') {
    throw new TypeError(`Writable stream must contain a function, but found ${JSON.stringify(writter)}`);
  }
  const batch = [];
  const ws = new Stream.Writable({
    objectMode: true,
    write: async function(chunk, encoding, next) {
      batch.push(chunk);
      if (batch.length >= opts.stream) {
        await emitBatch(this, writter, batch);
      }
      next();
    }
  });
  if (opts.stream > 0) {
    ws.on('close' /* 'finish' */, async function() {
      if (batch.length) {
        await emitBatch(ws, writter, batch);
      }
    });
  }
  return ws;
}

/**
 * Emits a readable or writable stream batch
 * @private
 * @param {(Stream.Readable | Stream.Writable)} stream The readable or writable stream
 * @param {(typedefs.SQLERStreamWritter | (typedefs.SQLERStreamReader)} [handler] The reader or writter that will return the value that will be emitted.
 * Omit to emit the batch itself
 * @param {Object[]} batch The batch to use as the value fro emit
 */
async function emitBatch(stream, handler, batch) {
  try {
    stream.emit(typedefs.EVENT_STREAM_BATCH, !handler && stream instanceof Stream.Readable ? batch : await handler(batch));
  } catch (err) {
    stream.emit('error', err);
  } finally {
    batch.length = 0;
  }
}

/**
 * @type {typedefs.SQLERInterpolateFunction}
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
 * @type {typedefs.SQLERPositionalBindsFunction}
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
 * @type {typedefs.SQLERBindExpansionFunction}
 * @private
 */
function bindExpansions(sql, binds) {
  // expansion substitutes
  if (binds) {
    // AND/OR conjunction expansions
    sql = sql.replace(/\[\[(OR|AND)([\S\s]*?)(:)(\w+)([\S\s]*?)\s*\]\]/gi, function sqlExpandConjRpl(match, conjunction, prefix, bindKey, bindName, suffix) {
      return segmentSubExpanded(binds, bindKey, bindName, ` ${conjunction}`, prefix, suffix);
    });
    // simple expansions using comma separations
    sql = sql.replace(/(:)([a-z]+[0-9]*?)/gi, function sqlArrayRpl(match, bindKey, bindName) {
      return segmentSubExpanded(binds, bindKey, bindName);
    });
  }
  return sql;
}

/**
 * Expands a bind parameter using surrounding separators and expands the binds to reflect multiple values.
 * @private
 * @param {Object} binds The key/value bind parameters to use
 * @param {String} bindKey The key that will be used when expanding the binding parameter names (e.g. `:`)
 * @param {String} bindName The bound parameter that will be expanded
 * @param {String} [conjunction=', '] The conjunction that will be used to separate the expanded binds
 * (e.g. conjunction = ', '; bindKey = ':'; bindName = 'myBind'; binds = { myBind: [1,2] };` would result in
 * `:myBind, :myBind1` with `binds = { myBind: 1, myBind1: 2 }`)
 * @param {String} prefix The prefix that will be used before each expanded bind parameter
 * (e.g. `prefix = 'UPPER('; suffix = ')'; conjunction = ' OR'; bindKey = ':'; bindName = 'myBind'; binds = { myBind: [1,2] };` would result in
 * `UPPER(:myBind) OR UPPER(:myBind1)` with `binds = { myBind: 1, myBind1: 2 }`)
 * @param {String} suffix The suffix that will be used after each expended bind parameter
 * (e.g. `prefix = 'UPPER('; suffix = ')'; conjunction = ' OR'; bindKey = ':'; bindName = 'myBind'; binds = { myBind: [1,2] };` would result in
 * `UPPER(:myBind) OR UPPER(:myBind1)` with `binds = { myBind: 1, myBind1: 2 }`)
 */
function segmentSubExpanded(binds, bindKey, bindName, conjunction = ', ', prefix = '', suffix = '') {
  let newKeys = '';
  for (let i = 0, vals = bindName && Array.isArray(binds[bindName]) && binds[bindName], l = vals && vals.length; i < l; ++i) {
    newKeys += `${(newKeys && conjunction) || ''}${prefix}${bindKey}${bindName}${i || ''}${suffix}`; // set SQL expanded binds
    binds[bindName + (i || '')] = vals[i]; // set expanded binds
  }
  return newKeys || (bindKey + bindName); // replace with new key(s) or leave as-is
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