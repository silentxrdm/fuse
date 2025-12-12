function collectFields(sample) {
    if (Array.isArray(sample)) {
        return sample.length > 0 ? collectFields(sample[0]) : [];
    }

    if (!sample || typeof sample !== 'object') {
        return [];
    }

    return Object.entries(sample).map(([key, value]) => ({
        name: key,
        type: Array.isArray(value) ? 'array' : typeof value,
        example: summarizeValue(value),
    }));
}

function summarizeValue(value) {
    if (value === null || value === undefined) {
        return null;
    }

    if (Array.isArray(value)) {
        return value.slice(0, 3);
    }

    if (typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).slice(0, 3));
    }

    return value;
}

module.exports = {
    collectFields,
};
