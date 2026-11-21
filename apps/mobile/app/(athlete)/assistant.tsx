/** Trip assistant: answers only from this athlete's trip facts, with tappable citations; never guesses. */
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AssistantReply, ChatTurn } from '@falcon/shared';
import { AiNotice, Chip } from '../../components/ui';
import { Bubble } from '../../components/athlete/Bubble';
import { CitationChip } from '../../components/athlete/CitationChip';
import { api, errorMessage } from '../../lib/api';
import { useSession } from '../../lib/role';
import { colors, font, radius, space, TAP } from '../../lib/theme';

const SUGGESTED = ['When do we leave?', "Who's my roommate?", "What's for dinner Friday?", 'What bus am I on?', 'What should I pack?'];
type Msg = { role: 'user' | 'assistant'; content: string; reply?: AssistantReply; error?: string };

export default function Assistant() {
  const { session } = useSession();
  const id = session.athleteId;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  // new athlete → new conversation
  useEffect(() => setMsgs([]), [id]);

  const ask = useMutation({
    mutationFn: (vars: { message: string; history: ChatTurn[] }) => api.assistant({ params: { id: id! }, body: vars }),
  });

  function send(text: string) {
    const message = text.trim();
    if (!message || !id || ask.isPending) return;
    const history: ChatTurn[] = msgs.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })).slice(-6);
    setMsgs((m) => [...m, { role: 'user', content: message }]);
    setInput('');
    ask.mutate(
      { message, history },
      {
        onSuccess: (reply) => setMsgs((m) => [...m, { role: 'assistant', content: reply.answer, reply }]),
        onError: (e) => setMsgs((m) => [...m, { role: 'assistant', content: 'Sorry — I could not answer that right now.', error: errorMessage(e) }]),
      },
    );
  }

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [msgs.length, ask.isPending]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
        {msgs.length === 0 && (
          <View style={{ gap: space.md }}>
            <Text style={s.h}>Ask about your trip</Text>
            <Text style={s.muted}>Answers come only from your published trip info. If I don't know, I'll tell you to ask a coach.</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {SUGGESTED.map((q) => (
                <Pressable key={q} accessibilityRole="button" accessibilityLabel={`Ask: ${q}`} onPress={() => send(q)} style={s.suggest}>
                  <Text style={{ color: colors.brown, fontWeight: '700', fontSize: font.md }}>{q}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        {msgs.map((m, i) => (
          <Bubble key={i} role={m.role} text={m.content}>
            {m.reply && m.reply.citations.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, maxWidth: '90%' }}>
                {m.reply.citations.map((f) => <CitationChip key={f.id} fact={f} />)}
              </View>
            )}
            {m.reply?.needs_staff && <Chip label="Ask a coach" tone="warn" />}
            {m.reply?.fact_guard.replaced && <Text style={s.caption}>Answer limited to verified trip info</Text>}
            {m.reply?.source === 'fallback' && <AiNotice message="AI is unavailable — showing what we can find in your trip info." />}
            {m.error && <AiNotice message={m.error} />}
          </Bubble>
        ))}
        {ask.isPending && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }} accessibilityLabel="Assistant is typing">
            <ActivityIndicator color={colors.orange} />
            <Text style={s.muted}>Checking your trip…</Text>
          </View>
        )}
      </ScrollView>
      <View style={s.bar}>
        {msgs.length > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel="New chat" onPress={() => setMsgs([])} style={s.iconBtn}>
            <Text style={{ fontSize: 20 }}>↺</Text>
          </Pressable>
        )}
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask about your trip…"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Question for the trip assistant"
          returnKeyType="send"
          onSubmitEditing={() => send(input)}
          maxLength={400}
          style={s.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send question"
          accessibilityState={{ disabled: !input.trim() || ask.isPending }}
          disabled={!input.trim() || ask.isPending}
          onPress={() => send(input)}
          style={[s.send, (!input.trim() || ask.isPending) && { opacity: 0.4 }]}
        >
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: font.md }}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  h: { fontSize: font.xl, fontWeight: '800', color: colors.brown },
  muted: { fontSize: font.md, color: colors.muted },
  caption: { fontSize: font.sm, color: colors.muted, fontStyle: 'italic' },
  suggest: { minHeight: 44, paddingHorizontal: space.md, justifyContent: 'center', borderRadius: 999, borderWidth: 2, borderColor: colors.brown, backgroundColor: '#fff' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: '#fff' },
  input: { flex: 1, minHeight: TAP, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, fontSize: font.md, color: colors.text },
  send: { minHeight: TAP, paddingHorizontal: space.lg, borderRadius: radius.md, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { minHeight: TAP, minWidth: TAP, alignItems: 'center', justifyContent: 'center' },
});
