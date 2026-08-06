// The TV board: a vertical column of Header over the auto-fitting card grid
// (or the empty state). The fleet comes from the shared store; each airframe is
// projected to a pure CardVM for the view. The whole column lives inside the
// minimum-board Stage: normally fluid at scale 1, and scaled down as one unit
// only when the TV reports less than the board's floor — so the display route
// never has to reflow for a small viewport and can never clip.
import type { JSX } from 'preact';
import { useFleet } from '../../model/useFleet';
import { toCardVM } from '../../model/derive';
import { Stage } from '../../layout/Stage';
import { Header } from './Header';
import { CardGrid } from './CardGrid';
import { EmptyState } from './EmptyState';

export function DisplayView(): JSX.Element {
  const fleet = useFleet();
  const cards = fleet.map(toCardVM);

  return (
    <Stage>
      <Header count={fleet.length} />
      {cards.length === 0 ? <EmptyState /> : <CardGrid cards={cards} />}
    </Stage>
  );
}
