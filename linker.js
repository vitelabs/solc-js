var assert = require('assert');
var keccak256 = require('js-sha3').keccak256;
var viteLib = require('@vite/vitejs-wallet').default;

function libraryHashPlaceholder (input) {
  return '$' + keccak256(input).slice(0, 34) + '$';
}

var linkBytecode = function (bytecode, libraries) {
  assert(typeof bytecode === 'string');
  assert(typeof libraries === 'object');
  // NOTE: for backwards compatibility support old compiler which didn't use file names
  var librariesComplete = {};
  for (var libraryName in libraries) {
    if (typeof libraries[libraryName] === 'object') {
      // API compatible with the standard JSON i/o
      for (var lib in libraries[libraryName]) {
        librariesComplete[lib] = libraries[libraryName][lib];
        librariesComplete[libraryName + ':' + lib] = libraries[libraryName][lib];
      }
    } else {
      // backwards compatible API for early solc-js versions
      var parsed = libraryName.match(/^([^:]+):(.+)$/);
      if (parsed) {
        librariesComplete[parsed[2]] = libraries[libraryName];
      }
      librariesComplete[libraryName] = libraries[libraryName];
    }
  }

  for (libraryName in librariesComplete) {
    var viteAddress = librariesComplete[libraryName];
    if (viteAddress.slice(0, 5) !== 'vite_' || viteAddress.length > 55) {
      throw new Error('Invalid Vite address specified for ' + libraryName);
    }
    // get hex of Vite address
    var hexAddress = viteLib.getOriginalAddressFromAddress(viteAddress);

    // Support old (library name) and new (hash of library name)
    // placeholders.
    var replace = function (name) {
      // truncate to 37 characters
      var truncatedName = name.slice(0, 36);
      var libLabel = '__' + truncatedName + Array(37 - truncatedName.length).join('_') + '____';
      while (bytecode.indexOf(libLabel) >= 0) {
        bytecode = bytecode.replace(libLabel, hexAddress);
      }
    };

    replace(libraryName);
    replace(libraryHashPlaceholder(libraryName));
  }

  return bytecode;
};

var findLinkReferences = function (bytecode) {
  assert(typeof bytecode === 'string');
  // find 42 bytes in the pattern of __...<36 digits>...____
  // e.g. __Lib.sol:L_______________________________
  var linkReferences = {};
  var offset = 0;
  while (true) {
    var found = bytecode.match(/__(.{36})____/);
    if (!found) {
      break;
    }

    var start = found.index;
    // trim trailing underscores
    // NOTE: this has no way of knowing if the trailing underscore was part of the name
    var libraryName = found[1].replace(/_+$/gm, '');

    if (!linkReferences[libraryName]) {
      linkReferences[libraryName] = [];
    }

    linkReferences[libraryName].push({
      // offsets are in bytes in binary representation (and not hex)
      start: (offset + start) / 2,
      length: 21
    });

    offset += start + 21;

    bytecode = bytecode.slice(start + 21);
  }
  return linkReferences;
};

module.exports = {
  linkBytecode: linkBytecode,
  findLinkReferences: findLinkReferences
};
