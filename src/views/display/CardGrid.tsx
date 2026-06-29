// The 3×2 card grid, scaled to fit the available height so the board never
// scrolls. useFitToHeight owns the grid's transform (measure → scale); we only
// set transform-origin here.
import type { JSX } from 'preact';
import type { CardVM } from '../../types';
import { useFitToHeight } from '../../layout/fit';
import { AirframeCard } from './AirframeCard';

export function CardGrid({ cards }: { cards: CardVM[] }): JSX.Element {
  const { areaRef, gridRef } = useFitToHeight(cards.length);

  return (
    <div ref={areaRef} style={area}>
      <div ref={gridRef} style={grid}>
        {cards.map((c) => (
          <AirframeCard key={c.id} vm={c} />
        ))}
      </div>
    </div>
  );
}

const area: JSX.CSSProperties = {
  flex: '1 1 auto',
  minHeight: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '18px 40px 8px',
  overflow: 'hidden',
};

// NOTE: do not set `transform` here — useFitToHeight drives it.
const grid: JSX.CSSProperties = {
  width: '100%',
  maxWidth: '1780px',
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: '18px',
  alignContent: 'center',
  transformOrigin: 'center center',
};
