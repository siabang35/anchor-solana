export function tokenize(text: string): string[] {
    return text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

const STOP_WORDS = new Set(['the', 'is', 'in', 'at', 'of', 'and', 'a', 'to', 'for', 'on', 'with', 'as', 'by', 'an', 'this', 'that']);

export function computeTfIdf(documents: string[]): number[][] {
    const docTokens = documents.map(tokenize);
    const df = new Map<string, number>();

    // Document Frequency
    for (const tokens of docTokens) {
        const uniqueTokens = new Set(tokens);
        for (const token of uniqueTokens) {
            df.set(token, (df.get(token) || 0) + 1);
        }
    }

    const n = documents.length;
    const vectors: number[][] = [];
    const vocabulary = Array.from(df.keys());

    // TF-IDF
    for (const tokens of docTokens) {
        const tf = new Map<string, number>();
        for (const token of tokens) {
            tf.set(token, (tf.get(token) || 0) + 1);
        }

        const vector = new Array(vocabulary.length).fill(0);
        for (let i = 0; i < vocabulary.length; i++) {
            const token = vocabulary[i];
            const termFreq = tf.get(token) || 0;
            if (termFreq > 0) {
                const idf = Math.log(n / (df.get(token) || 1));
                vector[i] = termFreq * idf;
            }
        }

        // Normalize
        const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        if (norm > 0) {
            for (let i = 0; i < vector.length; i++) {
                vector[i] /= norm;
            }
        }
        vectors.push(vector);
    }

    return vectors;
}

export function kMeansClustering(vectors: number[][], k: number, maxIterations = 50): number[] {
    if (vectors.length === 0) return [];
    if (vectors.length <= k) return vectors.map((_, i) => i);

    const n = vectors.length;
    const d = vectors[0].length;
    
    // Initialize centroids randomly from data points
    let centroids: number[][] = [];
    const usedIndices = new Set<number>();
    for (let c = 0; c < k; c++) {
        let idx;
        do {
            idx = Math.floor(Math.random() * n);
        } while (usedIndices.has(idx) && usedIndices.size < n);
        usedIndices.add(idx);
        centroids.push([...vectors[idx]]);
    }

    let assignments = new Array(n).fill(-1);
    let changed = true;
    let iterations = 0;

    while (changed && iterations < maxIterations) {
        changed = false;
        iterations++;

        // Assign to nearest centroid (cosine distance since vectors are normalized tf-idf)
        for (let i = 0; i < n; i++) {
            let bestDist = -Infinity;
            let bestCluster = 0;
            
            for (let c = 0; c < k; c++) {
                // dot product
                let dot = 0;
                let magC = 0;
                for (let j = 0; j < d; j++) {
                    dot += vectors[i][j] * centroids[c][j];
                    magC += centroids[c][j] * centroids[c][j];
                }
                magC = Math.sqrt(magC);
                const sim = magC === 0 ? 0 : dot / magC;
                
                if (sim > bestDist) {
                    bestDist = sim;
                    bestCluster = c;
                }
            }

            if (assignments[i] !== bestCluster) {
                assignments[i] = bestCluster;
                changed = true;
            }
        }

        // Update centroids
        if (changed) {
            const newCentroids = Array(k).fill(0).map(() => new Array(d).fill(0));
            const counts = new Array(k).fill(0);

            for (let i = 0; i < n; i++) {
                const cluster = assignments[i];
                counts[cluster]++;
                for (let j = 0; j < d; j++) {
                    newCentroids[cluster][j] += vectors[i][j];
                }
            }

            for (let c = 0; c < k; c++) {
                if (counts[c] > 0) {
                    for (let j = 0; j < d; j++) {
                        centroids[c][j] = newCentroids[c][j] / counts[c];
                    }
                } else {
                    // Reinitialize empty cluster
                    const randomIdx = Math.floor(Math.random() * n);
                    centroids[c] = [...vectors[randomIdx]];
                }
            }
        }
    }

    return assignments;
}
