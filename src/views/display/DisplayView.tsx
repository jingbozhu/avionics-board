// The TV board: a vertical column of Header over the auto-fitting card grid
// (or the empty state). The fleet comes from the shared store; each airframe is
// projected to a pure CardVM for the view.
import type { JSX } from 'preact';
import { useFleet } from '../../model/useFleet';
import { toCardVM } from '../../model/derive';
import { Header } from './Header';
import { CardGrid } from './CardGrid';
import { EmptyState } from './EmptyState';

export function DisplayView(): JSX.Element {
  const fleet = useFleet();
  const cards = fleet.map(toCardVM);

  return (
    <div style={wrap}>
      <Header count={fleet.length} />
      {cards.length === 0 ? <EmptyState /> : <CardGrid cards={cards} />}
    </div>
  );
}

const wrap: JSX.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  zIndex: 5,
};
