'use client';
import React from 'react';
import './WorldCupBracket.css';

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

function getTeam(ev: MatchEvent | undefined, side: 'home' | 'away', fallbackName: string, fallbackFlag: string) {
  const teamObj = side === 'home' ? ev?.home_team : ev?.away_team;
  const metaName = side === 'home' ? ev?.metadata?.homeTeamName : ev?.metadata?.awayTeamName;
  return {
    name: teamObj?.name || metaName || fallbackName,
    logo: teamObj?.logo_url || fallbackFlag,
  };
}

function StatusBadge({ ev }: { ev: MatchEvent | undefined }) {
  if (!ev || ev.status === 'scheduled') {
    return <span className="wc-badge wc-badge--upcoming">UPCOMING</span>;
  }
  if (ev.status === 'live') {
    return (
      <span className="wc-badge wc-badge--live">
        <span className="wc-badge__dot" />
        LIVE {ev.elapsed_time}&apos;
      </span>
    );
  }
  return <span className="wc-badge wc-badge--ft">FT</span>;
}

function MatchProgress({ ev }: { ev: MatchEvent | undefined }) {
  if (!ev || ev.status === 'scheduled') return null;
  const pct = ev.status === 'finished' ? 100 : Math.min(100, (ev.elapsed_time / 90) * 100);
  return (
    <div className="wc-progress">
      <div className="wc-progress__fill" style={{ width: `${pct}%` }} />
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
  const isLive = ev?.status === 'live';
  const isActive = activeCompId === compId;

  return (
    <div
      className={`wc-card ${isActive ? 'wc-card--active' : ''} ${isLive ? 'wc-card--live' : ''}`}
      onClick={() => onSelect(compId)}
      role="button"
      tabIndex={0}
    >
      {/* Glow layer */}
      <div className="wc-card__glow" />

      <div className="wc-card__inner">
        {/* Header */}
        <div className="wc-card__header">
          <span className="wc-card__round">{label}</span>
          <StatusBadge ev={ev} />
        </div>

        {/* Teams */}
        <div className="wc-card__teams">
          <div className={`wc-team ${isWinnerHome ? 'wc-team--winner' : ''}`}>
            <div className="wc-team__left">
              <div className="wc-team__flag-wrap">
                <img className="wc-team__flag" src={home.logo} alt={home.name} />
              </div>
              <span className="wc-team__name">{home.name}</span>
            </div>
            <span className={`wc-team__score ${ev?.status === 'live' || ev?.status === 'finished' ? 'wc-team__score--active' : ''}`}>
              {ev?.status === 'live' || ev?.status === 'finished' ? ev.home_score : '–'}
            </span>
          </div>

          <div className="wc-card__divider" />

          <div className={`wc-team ${isWinnerAway ? 'wc-team--winner' : ''}`}>
            <div className="wc-team__left">
              <div className="wc-team__flag-wrap">
                <img className="wc-team__flag" src={away.logo} alt={away.name} />
              </div>
              <span className="wc-team__name">{away.name}</span>
            </div>
            <span className={`wc-team__score ${ev?.status === 'live' || ev?.status === 'finished' ? 'wc-team__score--active' : ''}`}>
              {ev?.status === 'live' || ev?.status === 'finished' ? ev.away_score : '–'}
            </span>
          </div>
        </div>

        <MatchProgress ev={ev} />

        {/* Footer */}
        <div className="wc-card__footer">
          <span className="wc-card__cta">
            {isActive ? '⚡ Competing' : '🏆 Compete'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function WorldCupBracket({ sf1, sf2, final: finalEv, activeCompId, onSelectComp }: Props) {
  const fHome = getTeam(finalEv, 'home', 'Winner SF1', 'https://flagcdn.com/w320/un.png');
  const fAway = getTeam(finalEv, 'away', 'Winner SF2', 'https://flagcdn.com/w320/un.png');
  const isLive = finalEv?.status === 'live';
  const isFinished = finalEv?.status === 'finished';
  const isActive = activeCompId === FINAL_ID;

  return (
    <div className="wc-bracket" id="world-cup-bracket">
      {/* Ambient background */}
      <div className="wc-bracket__bg" />

      {/* Header */}
      <div className="wc-bracket__header">
        <div className="wc-bracket__title-group">
          <span className="wc-bracket__trophy">🏆</span>
          <div>
            <h2 className="wc-bracket__title">FIFA World Cup 2026</h2>
            <p className="wc-bracket__subtitle">AI Forecasting Match Center</p>
          </div>
        </div>
        <div className="wc-bracket__badges">
          <span className="wc-badge wc-badge--realtime">
            <span className="wc-badge__dot" />
            REAL-TIME
          </span>
        </div>
      </div>

      {/* Bracket Grid */}
      <div className="wc-bracket__grid">
        {/* SF1 */}
        <SemifinalCard
          ev={sf1} label="Semi-final 1" activeCompId={activeCompId} compId={SF1_ID}
          onSelect={onSelectComp} homeDefault="France" awayDefault="Spain"
          homeFlagFB="https://media.api-sports.io/football/teams/2.png"
          awayFlagFB="https://media.api-sports.io/football/teams/9.png"
        />

        {/* Connector 1 */}
        <div className="wc-connector">
          <div className="wc-connector__line">
            <div className="wc-connector__pulse" />
          </div>
        </div>

        {/* FINAL */}
        <div
          className={`wc-final ${isActive ? 'wc-final--active' : ''} ${isLive ? 'wc-final--live' : ''}`}
          onClick={() => onSelectComp(FINAL_ID)}
          role="button"
          tabIndex={0}
        >
          <div className="wc-final__glow" />
          <div className="wc-final__shimmer" />

          <div className="wc-final__inner">
            <div className="wc-final__crown">🏆</div>
            <div className="wc-final__label">GRAND FINAL</div>

            <div className="wc-final__matchup">
              {/* Home */}
              <div className="wc-final__side">
                <div className="wc-final__flag-wrap">
                  <img className="wc-final__flag" src={fHome.logo} alt={fHome.name} />
                </div>
                <span className="wc-final__team-name">{fHome.name}</span>
              </div>

              {/* Score / VS */}
              <div className="wc-final__center">
                {isLive || isFinished ? (
                  <>
                    <span className="wc-final__score">
                      {finalEv!.home_score} <span className="wc-final__score-sep">:</span> {finalEv!.away_score}
                    </span>
                    <span className={`wc-final__status-text ${isLive ? 'wc-final__status-text--live' : ''}`}>
                      {isLive ? `⚡ ${finalEv!.elapsed_time}'` : '✓ Full Time'}
                    </span>
                  </>
                ) : (
                  <span className="wc-final__vs">VS</span>
                )}
              </div>

              {/* Away */}
              <div className="wc-final__side">
                <div className="wc-final__flag-wrap">
                  <img className="wc-final__flag" src={fAway.logo} alt={fAway.name} />
                </div>
                <span className="wc-final__team-name">{fAway.name}</span>
              </div>
            </div>

            <MatchProgress ev={finalEv} />

            <div className="wc-final__bottom">
              <span className="wc-final__pill">
                {isActive ? '⚡ Competing' :
                 isLive ? '⚡ Live Match Center' :
                 isFinished ? '🏆 Tournament Complete' :
                 finalEv ? '🏆 Compete' :
                 '⏳ Awaiting Semi-final Results'}
              </span>
            </div>
          </div>
        </div>

        {/* Connector 2 */}
        <div className="wc-connector">
          <div className="wc-connector__line">
            <div className="wc-connector__pulse" />
          </div>
        </div>

        {/* SF2 */}
        <SemifinalCard
          ev={sf2} label="Semi-final 2" activeCompId={activeCompId} compId={SF2_ID}
          onSelect={onSelectComp} homeDefault="England" awayDefault="Argentina"
          homeFlagFB="https://media.api-sports.io/football/teams/10.png"
          awayFlagFB="https://media.api-sports.io/football/teams/26.png"
        />
      </div>
    </div>
  );
}
