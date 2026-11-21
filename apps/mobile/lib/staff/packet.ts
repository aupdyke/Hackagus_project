/** Packet helpers (B-11): server HTML → PDF via expo-print → iOS share sheet; read-only link via Share. */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';
import { api } from '../api';

export async function sharePacketPdf(tripId: string, audience: 'staff' | 'athlete', athleteId?: string): Promise<void> {
  const packet = await api.getPacket({ params: { id: tripId }, query: { audience, athleteId } });
  const { uri } = await Print.printToFileAsync({ html: packet.html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: packet.title });
  } else {
    // simulator / web without a share target: fall back to the system print dialog
    await Print.printAsync({ uri });
  }
}

/** Returns false when the trip has no share link yet (not published). */
export async function shareReadOnlyLink(tripId: string, opponent: string): Promise<boolean> {
  const packet = await api.getPacket({ params: { id: tripId }, query: { audience: 'staff' } });
  if (!packet.share_url) return false;
  await Share.share({ message: `Travel plan — at ${opponent}: ${packet.share_url}`, url: packet.share_url, title: packet.title });
  return true;
}
