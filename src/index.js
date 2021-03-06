const assert = require('assert');

// Converter helpers for Joi types.
const TYPES = {
  alternatives: (schema, joi) => {
    const result = schema.oneOf = [];

    joi._inner.matches.forEach(function (match) {

      if (match.schema) {
        return result.push(convert(match.schema));
      }

      if (!match.is) {
        throw new Error('joi.when requires an "is"');
      }
      if (!(match.then || match.otherwise)) {
        throw new Error('joi.when requires one or both of "then" and "otherwise"');
      }

      if (match.then) {
        result.push(convert(match.then));
      }

      if (match.otherwise) {
        result.push(convert(match.otherwise));
      }

    });
    return schema;
  },

  date: (schema) => {
    schema.type = 'string';
    schema.format = 'date-time';
    return schema;
  },

  any: (schema) => {
    schema.type = [
      "array",
      "boolean",
      'number',
      "object",
      'string',
      "null"
    ];
    return schema;
  },

  array: (schema, joi) => {
    schema.type = 'array';

    joi._tests.forEach((test) => {
      switch (test.name) {
        case 'unique':
          schema.uniqueItems = true;
          break;
        case 'length':
          schema.minItems = schema.maxItems = test.arg;
          break;
        case 'min':
          schema.minItems = test.arg;
          break;
        case 'max':
          schema.maxItems = test.arg;
          break;
      }
    });

    if (joi._inner) {
      if (joi._inner.ordereds.length) {
        schema.ordered = joi._inner.ordereds.map((item) => convert(item));
      }

      let list;
      if (joi._inner.inclusions.length) {
        list = joi._inner.inclusions;
      } else if (joi._inner.requireds.length) {
        list = joi._inner.requireds;
      }

      if (list) {
        schema.items = convert(list[0]);
      }
    }

    return schema;
  },

  boolean: (schema) => {
    schema.type = 'boolean';
    return schema;
  },

  number: (schema, joi) => {
    schema.type = 'number';
    joi._tests.forEach((test) => {
      switch (test.name) {
        case 'integer':
          schema.type = 'integer';
          break;
        case 'less':
          schema.exclusiveMaximum = true;
          schema.maximum = test.arg;
          break;
        case 'greater':
          schema.exclusiveMinimum = true;
          schema.minimum = test.arg;
          break;
        case 'min':
          schema.minimum = test.arg;
          break;
        case 'max':
          schema.maximum = test.arg;
          break;
      }
    });
    return schema;
  },

  string: (schema, joi) => {
    schema.type = 'string';

    joi._tests.forEach((test) => {
      switch (test.name) {
        case 'email':
          schema.format = 'email';
          break;
        case 'regex':
          schema.pattern = String(test.arg.pattern).replace(/^\//,'').replace(/\/$/,'');
          break;
        case 'min':
          schema.minLength = test.arg;
          break;
        case 'max':
          schema.maxLength = test.arg;
          break;
        case 'length':
          schema.minLength = schema.maxLength = test.arg;
          break;
        case 'uri':
          schema.format = 'uri';
          break;
      }
    });

    return schema;
  },

  object: (schema, joi) => {
    schema.type = 'object';
    schema.properties = {};
    schema.additionalProperties = Boolean(joi._flags.allowUnknown);
    schema.patterns = joi._inner.patterns.map((pattern) => {
      return {regex: pattern.regex, rule: convert(pattern.rule)};
    });

    if (!joi._inner.children) {
      return schema;
    }

    joi._inner.children.forEach((property) => {
      if(property.schema._flags.presence !== 'forbidden') {
        schema.properties[property.key] = convert(property.schema);
        if (property.schema._flags.presence === 'required') {
          schema.required = schema.required || [];
          schema.required.push(property.key);
        }
      }
    });

    return schema;
  }
};

/**
 * Converts the supplied joi validation object into a JSON schema object,
 * optionally applying a transformation.
 *
 * @param {JoiValidation} joi
 * @param {TransformFunction} [transformer=null]
 * @returns {JSONSchema}
 */
function convert(joi,transformer=null) {

  assert('object'===typeof joi && true === joi.isJoi, 'requires a joi schema object');

  assert(joi._type, 'joi schema object must have a type');

  if(!TYPES[joi._type]){
    throw new Error(`sorry, do not know how to convert unknown joi type: "${joi._type}"`);
  }

  if(transformer){
    assert('function'===typeof transformer, 'transformer must be a function');
  }

  // JSON Schema root for this type.
  let schema = {};

  // Copy over the details that all schemas may have...
  if (joi._description) {
    schema.description = joi._description;
  }

  // Add the label as a title if it exists
  if (joi._settings && joi._settings.language && joi._settings.language.label) {
    schema.title = joi._settings.language.label;
  } else if (joi._flags && joi._flags.label) {
    schema.title = joi._flags.label;
  }

  // Checking for undefined and null explicitly to allow false and 0 values
  if (joi._flags && joi._flags.default !== undefined && joi._flags.default !== null) {
    schema['default'] = joi._flags.default;
  }

  if (joi._valids && joi._valids._set && joi._valids._set.length){
    if(Array.isArray(joi._inner.children)) {
      return {
        '------oneOf': [
          {
            'type': joi._type,
            'enum': joi._valids._set
          },
          TYPES[joi._type](schema, joi)
        ]
      };
    }
    schema['enum']=joi._valids._set;
  }

  let result = TYPES[joi._type](schema, joi);
  if(transformer){
    result = transformer(result);
  }

  return result;
}

module.exports = convert;

/**
 * Joi Validation Object
 * @typedef {object} JoiValidation
 */

/**
 * Transformation Function - applied just before `convert()` returns and called as `function(object):object`
 * @typedef {function} TransformFunction
 */

/**
 * JSON Schema Object
 * @typedef {object} JSONSchema
 */
