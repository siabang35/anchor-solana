const deepNormalize = (title) => {
    return title
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[—–\-]+/g, ' ')
        .replace(/outcome prediction\??/gi, '')
        .replace(/\[[a-f0-9]{4,10}\]/gi, '')
        .replace(/\$[\d,.]+/g, '')
        .replace(/[\d,.]+%/g, '')
        .replace(/\d{1,2}h\s*change/gi, '')
        .replace(/source:\s*https?:\/\/\S+/gi, '')
        .replace(/https?:\/\/\S+/gi, '')
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
};
const tokenize = (text) => new Set(text.split(/\s+/).filter(w => w.length > 2));
const jaccardSim = (a, b) => {
    let intersection = 0;
    for (const t of a) { if (b.has(t)) intersection++; }
    const union = a.size + b.size - intersection;
    return union > 0 ? intersection / union : 0;
};

const title1 = 'AFL Premiership: North Melbourne Kangaroos vs Hawthorn Hawks — outcome prediction?';
const title2 = 'AFL Premiership: Sydney Swans vs Richmond Tigers — outcome prediction?';

const norm1 = deepNormalize(title1);
const norm2 = deepNormalize(title2);
console.log('Norm1:', norm1);
console.log('Norm2:', norm2);
const t1 = tokenize(norm1);
const t2 = tokenize(norm2);
console.log('Tokens1:', [...t1]);
console.log('Tokens2:', [...t2]);
console.log('Similarity:', jaccardSim(t1, t2));
