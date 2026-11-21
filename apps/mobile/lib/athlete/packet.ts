/** Athlete packet → PDF → iOS share sheet; read-only link via the RN Share sheet. */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';
import { ApiClientError } from '@falcon/shared';
import { api, errorMessage } from '../api';

export async function shareAthletePacket(tripId: string, athleteId: string): Promise<void> {
  let packet;
  try {
    packet = await api.getPacket({ params: { id: tripId }, query: { audience: 'athlete', athleteId } });
  } catch (e) {
    if (e instanceof ApiClientError && (e.status === 403 || e.status === 501)) throw new Error('Your travel packet is not available yet — ask a coach.');
    throw new Error(errorMessage(e));
  }
  const { uri } = await Print.printToFileAsync({ html: packet.html });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: packet.title });
}

export async function shareTripLink(url: string, opponent: string): Promise<void> {
  if (!url) throw new Error('No share link yet — the trip has not been published.');
  await Share.share({ message: `BGSU Falcons at ${opponent} — itinerary: ${url}`, url });
}
