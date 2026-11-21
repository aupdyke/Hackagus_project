/**
 * Public read-only share page: GET /share/:tripId/:token  (HTML, not JSON). Token is random (18 bytes,
 * base64url) and compared in constant time. Shows the PUBLIC packet variant (A-11): no names, no costs.
 */
import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { repo } from '../repo';
import { gameById } from '../data';
import { renderPacketHtml } from '../features/packet';

export const shareRouter = Router();

const safeEq = (a: string, b: string) => {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
};

shareRouter.get('/share/:tripId/:token', (req, res) => {
  const trip = repo.trips.get(req.params.tripId);
  if (!trip || !trip.share_token || trip.status !== 'published' || !safeEq(trip.share_token, req.params.token)) {
    res.status(404).type('html').send('<!doctype html><h1>Link not found or expired</h1>');
    return;
  }
  const game = gameById(trip.game_id);
  const pkg = trip.packages.find((p) => p.option_id === trip.selected_option_id);
  if (!game || !pkg) {
    res.status(404).type('html').send('<!doctype html><h1>Link not found or expired</h1>');
    return;
  }
  // Public variant: itinerary, hotel, meals, contacts by role, packing list — no names, no costs.
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.type('html').send(renderPacketHtml({ trip, game, pkg, audience: 'public' }).html);
});
