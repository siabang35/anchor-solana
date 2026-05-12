import React, { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, Time, ColorType, AreaSeries } from 'lightweight-charts';

interface SolanaChartProps {
    symbol?: string; // Default: 'SOLUSDT'
    interval?: string; // Default: '1m'
    onPriceUpdate?: (price: number) => void;
}

export default function SolanaChart({ symbol = 'SOLUSDT', interval = '1m', onPriceUpdate }: SolanaChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
    const [currentPrice, setCurrentPrice] = useState<number | null>(null);
    const [priceChangePercent, setPriceChangePercent] = useState<number>(0);
    
    // Timeframes mapping
    const timeframes = ['1D', '1W', '1M', '6M', '1Y'];
    const [activeTimeframe, setActiveTimeframe] = useState('1D');

    useEffect(() => {
        if (!chartContainerRef.current) return;

        // Clean up previous chart if it exists
        if (chartRef.current) {
            chartRef.current.remove();
        }

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#94a3b8',
                fontFamily: 'var(--font-mono)',
            },
            grid: {
                vertLines: { visible: false },
                horzLines: { visible: false },
            },
            timeScale: {
                visible: false, // hide time scale to match design
            },
            rightPriceScale: {
                visible: false, // hide price scale to match design
            },
            crosshair: {
                vertLine: {
                    color: 'rgba(34, 211, 238, 0.4)',
                    width: 1,
                    style: 3, // dashed
                },
                horzLine: {
                    color: 'rgba(34, 211, 238, 0.4)',
                    width: 1,
                    style: 3,
                },
            },
            handleScroll: false,
            handleScale: false,
        });

        chartRef.current = chart;

        const areaSeries = chart.addSeries(AreaSeries, {
            lineColor: '#22d3ee', // Cyan
            topColor: 'rgba(34, 211, 238, 0.4)',
            bottomColor: 'rgba(34, 211, 238, 0.0)',
            lineWidth: 2,
            priceLineVisible: false,
            crosshairMarkerVisible: true,
            crosshairMarkerRadius: 4,
        });
        
        seriesRef.current = areaSeries;

        // Fetch historical data to populate initially
        const fetchHistory = async () => {
            try {
                // Get last 100 candles for 1m interval
                const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=100`);
                
                // Binance REST K-line array format
                type BinanceKlineData = (number | string)[];
                const data: BinanceKlineData[] = await res.json();
                
                const historicalData = data.map((d) => ({
                    time: (Number(d[0]) / 1000) as Time,
                    value: parseFloat(String(d[4])), // Close price
                }));
                
                if (historicalData.length > 0) {
                    areaSeries.setData(historicalData);
                    const lastPrice = historicalData[historicalData.length - 1].value;
                    const firstPrice = historicalData[0].value;
                    setCurrentPrice(lastPrice);
                    if (onPriceUpdate) onPriceUpdate(lastPrice);
                    setPriceChangePercent(((lastPrice - firstPrice) / firstPrice) * 100);
                }
                chart.timeScale().fitContent();
            } catch (err) {
                console.error("Failed to fetch historical data", err);
            }
        };

        fetchHistory();

        // Connect Binance WebSocket
        const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`);

        interface BinanceWsMessage {
            k?: {
                t: number; // Kline start time
                c: string; // Close price
            };
        }

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data) as BinanceWsMessage;
            const kline = message.k;
            if (kline) {
                const closePrice = parseFloat(kline.c);
                const time = (kline.t / 1000) as Time;
                
                // Update chart
                if (seriesRef.current) {
                    seriesRef.current.update({
                        time,
                        value: closePrice,
                    });
                }
                
                // Update current price UI
                setCurrentPrice(closePrice);
                if (onPriceUpdate) onPriceUpdate(closePrice);
                // The price change % would ideally be 24h change, but for demo we keep the simple historical calculation or fetch 24h ticker.
            }
        };

        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            ws.close();
            if (chartRef.current) {
                chartRef.current.remove();
                chartRef.current = null;
            }
        };
    }, [symbol, interval, onPriceUpdate]);

    return (
        <div className="chart-wrapper">
            <div className="chart-header">
                <div className="chart-title">SOL • USD</div>
                <div className="chart-price-row">
                    <div className="chart-price">
                        ${currentPrice !== null ? currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---'}
                    </div>
                    <div className={`chart-change ${priceChangePercent >= 0 ? 'positive' : 'negative'}`}>
                        {priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%
                    </div>
                </div>
            </div>

            <div className="chart-container" ref={chartContainerRef} style={{ width: '100%', height: '240px' }} />

            <div className="chart-timeframes">
                {timeframes.map((tf) => (
                    <button 
                        key={tf} 
                        className={`timeframe-btn ${activeTimeframe === tf ? 'active' : ''}`}
                        onClick={() => setActiveTimeframe(tf)}
                    >
                        {tf}
                    </button>
                ))}
            </div>

            <style>{`
                .chart-wrapper {
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }
                .chart-header {
                    display: flex;
                    flex-direction: column;
                    gap: 0.25rem;
                }
                .chart-title {
                    font-size: 0.85rem;
                    color: var(--text-muted);
                    font-weight: 500;
                }
                .chart-price-row {
                    display: flex;
                    align-items: baseline;
                    justify-content: space-between;
                }
                .chart-price {
                    font-size: 2rem;
                    font-weight: 700;
                    color: var(--text-primary);
                }
                .chart-change {
                    font-size: 0.85rem;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 0.25rem;
                }
                .chart-change.positive { color: #22c55e; }
                .chart-change.negative { color: #ef4444; }
                
                .chart-container {
                    position: relative;
                }

                .chart-timeframes {
                    display: flex;
                    justify-content: space-between;
                    padding: 0 1rem;
                    margin-top: -0.5rem;
                }
                .timeframe-btn {
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    font-size: 0.8rem;
                    font-weight: 500;
                    padding: 0.4rem 0.6rem;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .timeframe-btn:hover {
                    color: var(--text-primary);
                }
                .timeframe-btn.active {
                    color: var(--text-primary);
                    background: rgba(255, 255, 255, 0.1);
                    font-weight: 600;
                }
            `}</style>
        </div>
    );
}
