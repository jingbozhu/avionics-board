# Orthodromic Reverie

*An algorithmic philosophy for the IAI front door.*

---

## The movement

**Orthodromic Reverie** is the aesthetic of a navigational instrument left running
with nothing to navigate. The avionics board tracks a real Earth: real textures,
a real subsolar point, real terrain scrolling under a real sun. Turn that same
apparatus inward and the terrain falls away. What remains is the *machinery* of
position — the sphere, the geodesics, the projection — running on no cargo at
all. A machine dreaming rather than a machine tracking. The philosophy insists
that the difference between instrumentation and decoration is not ornament but
*commitment to a coordinate system*: every mark on screen must be the honest
projection of something that exists in three dimensions, never a shape drawn
because it looked good.

## Geodesics as thought

An orthodrome is the shortest path between two points on a sphere — the answer to
a question about travel. Draw one and you have a route. Draw six hundred,
overlapping, at low alpha, with no endpoints marked, and you no longer have
routes; you have the *space of all possible routes*, held simultaneously and
unresolved. This is the conceptual spine of the work: inference rendered as the
simultaneous evaluation of every geodesic, none of them yet chosen. The field is
not depicting an answer. It is depicting the condition immediately before one.
Every arc is a hypothesis the system has not committed to, and the accumulated
shell of them is what deliberation looks like from outside.

## The invariant, and where the stillness actually lives

For a great circle with unit normal **n** on a sphere rendered in orthographic
projection, the closest the projected ellipse ever comes to the center of the
disc is exactly `|n·ẑ|`. That identity is the load-bearing structure of the
generator. Sample normals only from the polar cap `n_z ≥ k` and the entire family
of arcs is mathematically forbidden from entering a central disc of radius `k·R`
— not damped, not faded, not masked. Forbidden. Rotation is applied about the
view axis alone, and each arc's `n_z` breathes only *within* its permitted band,
precisely so the invariant survives every frame the algorithm will ever draw.
What this buys, in the composition as framed, is not an empty middle but a
*governed annulus*: the arcs are held in a shell of known inner and outer radius,
which is what makes their density predictable enough to tune.

The stillness the eye needs is bought a second way, and it is the board's own
answer rather than a new one. The sphere is thrown off-screen to the
bottom-right — same offsets, same 240vh scale, same 4px blur the Earth gets on
the Display route — so only its upper limb burns into frame. Its center never
appears; the clear disc is a fact about the generator, not a hole in the picture.
The calm is the two-thirds of the viewport the field never reaches, and the entry
gate sits there, exactly where the board puts its cards. Composition by
displacement, not by carving. Both mechanisms are the product of the same
discipline: negative space that costs nothing to maintain because it was derived
from where the body sits, never policed frame by frame.

The lean is quoted rather than reproduced. The globe tilts 25° by rotating its
sampling frame about the view axis, and you only read that lean because the Earth
texture breaks the symmetry. This field has no texture and is rotationally
symmetric about its own axis, so the identical rotation would be perfectly
invisible on it — a constant faithfully applied and entirely unseen. The tilt is
therefore expressed where it can be *seen*: as the axis of an azimuthal
brightness gradient, arcs burning brighter as their inner tangent swings toward a
direction 25° right of vertical. A lit limb leaning the way the Earth leans,
arrived at honestly, without pretending to be a terminator.

## Accumulation, decay, and the refusal to redraw

The shell must not be redrawn each frame. Redrawing is how a machine renders a
picture; *accumulation* is how a machine renders a process. A small batch of
geodesics is committed to the buffer each frame and then abandoned to a phosphor
decay that erases alpha rather than painting over it — so the field thins toward
transparency and the page beneath shows through, never toward an opaque black
rectangle sitting on the design. Because the spawn orientation advances with
time while the residue does not, the moiré shell smears very slightly against its
own history, exactly as a long-persistence scope smears. This is simultaneously
the cheapest possible implementation and the most truthful one, and the
coincidence is not luck: it is what painstaking optimization looks like when the
optimization and the aesthetic are pursued as a single problem by someone at the
top of their field.

## Restraint in chroma

The palette is not chosen; it is *inherited*. The globe's inner-rim ambient
`rgb(40, 94, 182)` carries the overwhelming majority of arcs, with the board's
cool secondary text hue beneath it. The warm accents — amber, gold, orange — and
the status green are rationed to roughly one arc in seven. This ratio is the
difference between an instrument and a light show. Warmth in this world means
*signal*; spend it freely and it stops meaning anything. Every alpha here is
deliberately below the threshold at which a single arc is legible on its own,
because the subject is never the arc — it is the interference of many, and that
density must be earned by count rather than declared by opacity. Countless
iterations converge on the same lesson: the algorithm is finished when removing
any further saturation would make it illegible and adding any would make it
decorative.

## Determinism and the operator's hand

Everything is seeded. The same seed yields the same infinite stream of arcs, so
the dream is reproducible — a machine that dreams the same dream on demand.
Against that determinism sits the single channel of human influence: the pointer,
which is never permitted to be followed. It biases the field — a few pixels of
parallax, a whisper of field-strength weighting toward the side it rests on —
through easing slow enough that the operator senses influence without ever
catching cause and effect in the act. The instrument acknowledges the hand
without obeying it. That deliberate, meticulously damped refusal is the last
mark of craftsmanship in the piece: restraint held steady across every parameter,
so the field reads as something that was tuned for a very long time by someone
who knew exactly which impulses to leave out.
