/**
 * Public read-only share page: GET /share/:tripId/:token  (HTML, not JSON). Token is random (18 bytes,
 * base64url) and compared in constant time. Shows the ATHLETE packet (no costs). Full render in A-11.
 */
import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { repo } from '../repo';
import { gameById } from '../data';

export const shareRouter = Router();

const safeEq = (a: string, b: string) => {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

shareRouter.get('/share/:tripId/:token', (req, res) => {
  const trip = repo.trips.get(req.params.tripId);
  if (!trip || !trip.share_token || trip.status !== 'published' || !safeEq(trip.share_token, req.params.token)) {
    res.status(404).type('html').send('<!doctype html><h1>Link not found or expired</h1>');
    return;
  }
  const game = gameById(trip.game_id)!;
  // TODO(A-11): render the athlete packet HTML (shared renderer used by GET /trips/:id/packet).
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BGSU at ${esc(game.opponent)}</title></head>
<body style="font-family:-apple-system,Helvetica,Arial;margin:16px"><h1 style="color:#4F2C1D">BGSU Falcons at ${esc(game.opponent)}</h1>
<p>${esc(game.date)} · kickoff ${esc(game.kickoff_local)} · ${esc(game.stadium_name)}</p><p><em>Read-only itinerary. Synthetic data.</em></p></body></html>`);
});
