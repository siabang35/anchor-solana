'use client';
import React from 'react';
import './WorldCupBracket.css';

interface TeamData {
  name: string;
  logo: string;
}

interface MatchEvent {
  external_id: string;
  status: string;
  home_score: number;
  away_score: number;
  elapsed_time: number;
  home_team?: { name: string; logo_url: string };
  away_team?: { name: string; logo_url: string };
  metadata?: { homeTeamName?: string; awayTeamName?: string };
  venue?: string;
}

interface Props {
  sf1: MatchEvent | undefined;
  sf2: MatchEvent | undefined;
  final: MatchEvent | undefined;
  activeCompId: string | undefined;
  onSelectComp: (id: string) => void;
}

const SF1_ID = 'a7d7f766-1c2c-4b5b-8c8d-444444444441';
const SF2_ID = 'a7d7f766-1c2c-4b5b-8c8d-444444444442';
const FINAL_ID = 'a7d7f766-1c2c-4b5b-8c8d-444444444443';

function getTeam(ev: MatchEvent | undefined, side: 'home' | 'away', fallbackName: string, fallbackFlag: string): TeamData {
  const teamObj = side === 'home' ? ev?.home_team : ev?.away_team;
  const metaName = side === 'home' ? ev?.metadata?.homeTeamName : ev?.metadata?.awayTeamName;
  return {
    name: teamObj?.name || metaName || fallbackName,
    logo: teamObj?.logo_url || fallbackFlag,
  };
}

function StatusBadge({ ev }: { ev: MatchEvent | undefined }) {
  if (!ev || ev.status === 'scheduled') {
    return <span className="wc-status upcoming">⏳ UPCOMING</span>;
  }
  if (ev.status === 'live') {
    return (
      <span className="wc-status live">
        <span className="wc-status-dot" />
        LIVE {ev.elapsed_time}&apos;
      </span>
    );
  }
  return <span className="wc-status finished">✓ FT</span>;
}

function ScoreDisplay({ ev, score }: { ev: MatchEvent | undefined; score: number }) {
  const isActive = ev?.status === 'live' || ev?.status === 'finished';
  return (
    <span className={`wc-team-score ${isActive ? 'active' : 'idle'}`}>
      {isActive ? score : '–'}
    </span>
  );
}

function MatchProgress({ ev }: { ev: MatchEvent | undefined }) {
  if (!ev || ev.status === 'scheduled') return null;
  const pct = ev.status === 'finished' ? 100 : Math.min(100, (ev.elapsed_time / 90) * 100);
  return (
    <div className="wc-progress">
      <div className="wc-progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

function SemifinalCard({ ev, label, activeCompId, compId, onSelect, homeDefault, awayDefault, homeFlagFB, awayFlagFB }: {
  ev: MatchEvent | undefined;
  label: string;
  activeCompId: string | undefined;
  compId: string;
  onSelect: (id: string) => void;
  homeDefault: string;
  awayDefault: string;
  homeFlagFB: string;
  awayFlagFB: string;
}) {
  const home = getTeam(ev, 'home', homeDefault, homeFlagFB);
  const away = getTeam(ev, 'away', awayDefault, awayFlagFB);
  const isWinnerHome = ev?.status === 'finished' && ev.home_score > ev.away_score;
  const isWinnerAway = ev?.status === 'finished' && ev.away_score > ev.home_score;

  return (
    <div
      className={`wc-match ${activeCompId === compId ? 'active' : ''}`}
      onClick={() => onSelect(compId)}
    >
      <div className="wc-match-header">
        <span className="wc-match-label">{label}</span>
        <StatusBadge ev={ev} />
      </div>

      <div className={`wc-team-row ${isWinnerHome ? 'winner' : ''}`}>
        <div className="wc-team-info">
          <img className="wc-team-flag" src={home.logo} alt={home.name} />
          <span className="wc-team-name">{home.name}</span>
        </div>
        <ScoreDisplay ev={ev} score={ev?.home_score ?? 0} />
      </div>

      <div className={`wc-team-row ${isWinnerAway ? 'winner' : ''}`}>
        <div className="wc-team-info">
          <img className="wc-team-flag" src={away.logo} alt={away.name} />
          <span className="wc-team-name">{away.name}</span>
        </div>
        <ScoreDisplay ev={ev} score={ev?.away_score ?? 0} />
      </div>

      <MatchProgress ev={ev} />

      {ev?.venue && (
        <div className="wc-venue">📍 {ev.venue}</div>
      )}
    </div>
  );
}

export default function WorldCupBracket({ sf1, sf2, final: finalEv, activeCompId, onSelectComp }: Props) {
  const fHome = getTeam(finalEv, 'home', 'Winner SF1', 'https://flagcdn.com/w320/un.png');
  const fAway = getTeam(finalEv, 'away', 'Winner SF2', 'https://flagcdn.com/w320/un.png');

  return (
    <div className="wc-bracket">
      {/* Header */}
      <div className="wc-header">
        <h2 className="wc-title">
          <span className="wc-title-icon">🏆</span>
          FIFA World Cup 2026 Match Center
        </h2>
        <span className="wc-live-badge">
          <span className="wc-live-dot" />
          REAL-TIME SIMULATION
        </span>
      </div>

      {/* 5-column Grid: SF1 | connector | FINAL | connector | SF2 */}
      <div className="wc-grid">
        {/* SF1 */}
        <SemifinalCard
          ev={sf1} label="Semifinal 1" activeCompId={activeCompId} compId={SF1_ID}
          onSelect={onSelectComp} homeDefault="France" awayDefault="Spain"
          homeFlagFB="https://media.api-sports.io/football/teams/2.png"
          awayFlagFB="https://media.api-sports.io/football/teams/9.png"
        />

        {/* Connector 1 */}
        <div className="wc-connector">
          <div className="wc-connector-line" />
        </div>

        {/* FINAL */}
        <div
          className={`wc-final-card ${activeCompId === FINAL_ID ? 'active' : ''}`}
          onClick={() => onSelectComp(FINAL_ID)}
        >
          <div className="wc-final-label">🏆 World Cup Grand Final</div>

          <div className="wc-final-teams">
            <div className="wc-final-team">
              <img className="wc-final-flag" src={fHome.logo} alt={fHome.name} />
              <span className="wc-final-team-name">{fHome.name}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
              {finalEv?.status === 'live' || finalEv?.status === 'finished' ? (
                <>
                  <span className="wc-final-score">{finalEv.home_score} – {finalEv.away_score}</span>
                  <span className="wc-final-live">
                    {finalEv.status === 'live' ? `LIVE ${finalEv.elapsed_time}'` : 'FULL TIME'}
                  </span>
                </>
              ) : (
                <span className="wc-vs">VS</span>
              )}
            </div>

            <div className="wc-final-team">
              <img className="wc-final-flag" src={fAway.logo} alt={fAway.name} />
              <span className="wc-final-team-name">{fAway.name}</span>
            </div>
          </div>

          <MatchProgress ev={finalEv} />

          <span className="wc-final-pill">
            {finalEv?.status === 'live' ? '⚡ Match Center Live' :
             finalEv?.status === 'finished' ? '🏆 Tournament Settled' :
             '⏳ Starts after Semifinals · Prize: 35.0 SOL'}
          </span>
        </div>

        {/* Connector 2 */}
        <div className="wc-connector">
          <div className="wc-connector-line" />
        </div>

        {/* SF2 */}
        <SemifinalCard
          ev={sf2} label="Semifinal 2" activeCompId={activeCompId} compId={SF2_ID}
          onSelect={onSelectComp} homeDefault="England" awayDefault="Argentina"
          homeFlagFB="https://media.api-sports.io/football/teams/10.png"
          awayFlagFB="https://media.api-sports.io/football/teams/26.png"
        />
      </div>
    </div>
  );
}
