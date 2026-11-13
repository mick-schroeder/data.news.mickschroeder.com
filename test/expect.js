// Minimal expect() over node:assert; covers the matchers test/all.js uses.
const assert = require('node:assert/strict')

const includes = (haystack, needle) => haystack.includes(needle)

const matchers = function (actual, negate) {
  const check = function (pass, message) {
    if (pass === negate) assert.fail(`${negate ? 'not: ' : ''}${message}`)
  }
  const show = value => JSON.stringify(value)

  const self = {
    equal: expected => negate
      ? assert.notStrictEqual(actual, expected)
      : assert.strictEqual(actual, expected),
    eql: expected => negate
      ? assert.notDeepStrictEqual(actual, expected)
      : assert.deepStrictEqual(actual, expected),
    include: item => check(includes(actual, item), `${show(actual)} includes ${show(item)}`),
    match: regex => check(regex.test(actual), `${show(actual)} matches ${regex}`),
    gt: n => check(actual > n, `${actual} > ${n}`),
    property: function (name, ...value) {
      check(actual != null && name in Object(actual), `has property ${name}`)
      if (value.length) assert.deepStrictEqual(actual[name], value[0])
    },
    true: () => check(actual === true, `${show(actual)} is true`),
    false: () => check(actual === false, `${show(actual)} is false`),
    null: () => check(actual === null, `${show(actual)} is null`),
    undefined: () => check(actual === undefined, `${show(actual)} is undefined`),
    falsy: () => check(!actual, `${show(actual)} is falsy`),
    string: () => check(typeof actual === 'string', `${show(actual)} is a string`),
    boolean: () => check(typeof actual === 'boolean', `${show(actual)} is a boolean`),
    function: () => check(typeof actual === 'function', 'is a function')
  }
  self.to = self.be = self.have = self
  return self
}

module.exports = function expect (actual) {
  const self = matchers(actual, false)
  self.not = matchers(actual, true)
  return self
}
