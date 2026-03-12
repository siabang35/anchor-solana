import { motion } from 'framer-motion';
import type { ClusterItem } from '../../../hooks/useClusterData';

interface Props {
    clusters: ClusterItem[];
    connected?: boolean;
    categoryColor?: string;
}

export function ClusterDataPanel({ clusters, connected = false, categoryColor = '#6366f1' }: Props) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-md p-5 md:p-6"
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold flex items-center gap-2">
                    <span>🧬</span> Cluster Data
                </h3>
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                    connected ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
                }`}>
                    {connected ? '● Live' : '○ Connecting'}
                </span>
            </div>

            {/* Empty State */}
            {clusters.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                    No cluster data yet. Waiting for ETL pipeline to process news...
                </div>
            )}

            {/* Cluster List */}
            <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                {clusters.map((cluster, i) => (
                    <div
                        key={cluster.id || i}
                        className={`p-3 rounded-lg transition-colors duration-300 ${
                            i === 0
                                ? 'border bg-card/80'
                                : 'border border-transparent hover:bg-muted/20'
                        }`}
                        style={i === 0 ? { borderColor: `${categoryColor}30`, background: `${categoryColor}08` } : {}}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-foreground">
                                📰 Cluster #{clusters.length - i}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                                {new Date(cluster.created_at).toLocaleTimeString()}
                            </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                            <span>{cluster.article_urls?.length || 0} articles</span>
                            <span>·</span>
                            <span>{cluster.signals?.length || 0} signals</span>
                            <span>·</span>
                            <span className={
                                cluster.sentiment > 0 ? 'text-emerald-400' :
                                cluster.sentiment < 0 ? 'text-red-400' : 'text-muted-foreground'
                            }>
                                {cluster.sentiment > 0 ? '📈' : cluster.sentiment < 0 ? '📉' : '➖'}{' '}
                                {(cluster.sentiment * 100).toFixed(0)}%
                            </span>
                        </div>
                        {cluster.cluster_hash && (
                            <div className="text-[9px] text-muted-foreground/60 mt-1 font-mono">
                                {cluster.cluster_hash.substring(0, 16)}...
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </motion.div>
    );
}
