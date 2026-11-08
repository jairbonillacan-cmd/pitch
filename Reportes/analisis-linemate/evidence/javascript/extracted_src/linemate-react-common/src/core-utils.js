// Iterates over the dictionary and swaps the keys with a specific value in the object
// dict => the dictionary to operate on
// entryKey => the key within each object to use as a swapping point
export function swapDictionary(dict, entryKey) {
    var newDictionary = {};
    Object.keys(dict).forEach((key) => {
      newDictionary[dict[key][entryKey]] = key;
    })
    return newDictionary;
}

// Swaps dictionary's keys to the values and vice versa
export function swapDictionaryKeyValue(dict) {
    var newDictionary = {};
    Object.keys(dict).forEach((key) => {
      newDictionary[dict[key]] = key;
    })
    return newDictionary;
}

export function mapDictionary(dict, valueMappingFunction) {
    var newDictionary = {};
    Object.keys(dict).forEach((key) => {
        newDictionary[key] = valueMappingFunction(dict[key]);
    })
    return newDictionary;
}

export function  getDictionaryValueRaw(dict, key) {
    var result = dict;
    var finalChunk = "";
    for (var chunk of key.split('.')) {
        finalChunk = chunk;
        if (result == null) {
        break;
        }
        result = result[chunk];
    }
    return {
        result: result,
        finalChunk: finalChunk
    }
}

export function getDictionaryValueRawResult(dict, key) {
    return getDictionaryValueRaw(dict, key).result;
}

// Compares the values associated with a list of keys in two dictionaries
// Both dictionaries must have all the keys provided
// If any of the dictionaries does not have one of the keys, false will be returned
export function isDictSubsetEqual(keys, dict1, dict2) {
    for (let key of keys) {
        if (!(key in dict1) || !(key in dict2)) {
            return false;
        }
        if (dict1[key] !== dict2[key]) {
            return false;
        }
    }
    return true;
}