import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { format, isValid, parse } from 'date-fns';
import { ChevronDown, ChevronUp, MapPin, Plus, TreePalm, Trash, User } from 'lucide-react-native';
import {
  PROFESSIONS,
  PROFESSION_LABELS,
  type Profession,
  type Service,
  type TimeOff,
} from '@boramarca/shared';
import {
  Avatar,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Header,
  IconButton,
  ListItem,
  Screen,
  Skeleton,
  Text,
  TextField,
  showToast,
} from '@/components';
import { data } from '@/data';
import {
  errorMessage,
  validateWeek,
  weekToWorkingHours,
  workingHoursToWeek,
  type Week,
} from '@/features/settings/format';
import { Section } from '@/features/settings/Section';
import { ServiceForm, ServiceRow } from '@/features/settings/ServiceForm';
import { useLoad } from '@/features/settings/useLoad';
import { WeekEditor } from '@/features/settings/WeekEditor';
import { useTheme } from '@/theme';
import { salonClock, salonInstant } from '@/utils/timezone';

const load = () =>
  Promise.all([
    data.profile.getMe(),
    data.profile.listServices(),
    data.profile.getWorkingHours(),
    data.profile.listTimeOff(),
  ]).then(([me, services, hours, timeOff]) => ({ me, services, hours, timeOff }));

/** Meu negócio (prompt 10, reference 11-ajustes, third screen): perfil, serviços, horários, folgas. */
export default function BusinessScreen() {
  const t = useTheme();
  const res = useLoad(load);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen edges={['top', 'left', 'right']} scroll>
        <Header title="Meu negócio" onBack={() => router.back()} />
        {res.loading ? (
          <View style={{ gap: t.spacing.md }}>
            <Skeleton height={t.sizes.avatarLg + t.spacing.xl} radius="lg" />
            <Skeleton height={t.touchTarget.min * 4} radius="lg" />
          </View>
        ) : res.error || !res.data ? (
          <ErrorState message={res.error ?? undefined} onRetry={res.reload} />
        ) : (
          <>
            <ProfileSection
              name={res.data.me.professional.name}
              professions={res.data.me.professional.professions}
              address={res.data.me.professional.address ?? ''}
            />
            <ServicesSection initial={res.data.services} />
            <HoursSection initial={workingHoursToWeek(res.data.hours)} />
            <TimeOffSection initial={res.data.timeOff} />
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

function ProfileSection(props: { name: string; professions: Profession[]; address: string }) {
  const t = useTheme();
  const [name, setName] = useState(props.name);
  const [professions, setProfessions] = useState(props.professions);
  const [address, setAddress] = useState(props.address);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return setError('Escreva como seus clientes te chamam.');
    if (professions.length === 0) return setError('Escolha pelo menos uma profissão.');
    setSaving(true);
    setError(null);
    try {
      await data.profile.updateMe({
        name: name.trim(),
        professions,
        address: address.trim() || null,
      });
      showToast('Perfil salvo.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Perfil">
      <View style={{ padding: t.spacing.sm, gap: t.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
          <Avatar name={name || '?'} size="lg" />
          <View style={{ flex: 1 }}>
            <Text variant="heading">{name}</Text>
            <Text color="textMuted">{professions.map((p) => PROFESSION_LABELS[p]).join(', ')}</Text>
          </View>
        </View>
        <TextField label="Nome" icon={User} value={name} onChangeText={setName} maxLength={120} />
        <Text weight="semibold">Profissão</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
          {PROFESSIONS.map((p) => (
            <Chip
              key={p}
              label={PROFESSION_LABELS[p]}
              selected={professions.includes(p)}
              onPress={() =>
                setProfessions((cur) =>
                  cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p],
                )
              }
            />
          ))}
        </View>
        <TextField
          label="Endereço para mandar aos clientes"
          icon={MapPin}
          value={address}
          onChangeText={setAddress}
          placeholder="Rua, número, sala, cidade"
          maxLength={300}
        />
        {error ? (
          <Text variant="bodySmall" color="danger">
            {error}
          </Text>
        ) : null}
        <Button label="Salvar perfil" onPress={save} loading={saving} />
      </View>
    </Section>
  );
}

function ServicesSection({ initial }: { initial: Service[] }) {
  const t = useTheme();
  const [services, setServices] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const run = useCallback(async (job: () => Promise<Service[]>, ok?: string) => {
    setSaving(true);
    try {
      setServices(await job());
      setEditing(null);
      if (ok) showToast(ok);
    } catch (e) {
      showToast(errorMessage(e), 'danger');
    } finally {
      setSaving(false);
    }
  }, []);

  // shortcut: up/down buttons instead of drag-to-reorder (no drag list installed); swap when one is.
  const move = (i: number, by: -1 | 1) => {
    const ids = services.map((s) => s.id);
    const [id] = ids.splice(i, 1);
    if (!id) return;
    ids.splice(i + by, 0, id);
    run(() => data.profile.reorderServices(ids));
  };

  return (
    <Section title="Serviços" subtitle="Gerencie os serviços que os clientes podem agendar.">
      <View style={{ padding: t.spacing.sm, gap: t.spacing.sm }}>
        {services.length === 0 && editing !== 'new' ? (
          <EmptyState
            title="Nenhum serviço ainda"
            message="Coloque pelo menos um serviço para a IA poder agendar."
          />
        ) : null}
        {services.map((s, i) =>
          editing === s.id ? (
            <ServiceForm
              key={s.id}
              initial={s}
              saving={saving}
              onCancel={() => setEditing(null)}
              onRemove={() =>
                run(async () => {
                  await data.profile.deleteService(s.id);
                  return data.profile.listServices();
                }, 'Serviço removido.')
              }
              onSave={(v) =>
                run(async () => {
                  await data.profile.updateService(s.id, v);
                  return data.profile.listServices();
                }, 'Serviço salvo.')
              }
            />
          ) : (
            <ServiceRow
              key={s.id}
              service={s}
              onEdit={() => setEditing(s.id)}
              right={
                <View>
                  {i > 0 ? (
                    <IconButton
                      icon={ChevronUp}
                      accessibilityLabel={`Subir ${s.name}`}
                      onPress={() => move(i, -1)}
                    />
                  ) : null}
                  {i < services.length - 1 ? (
                    <IconButton
                      icon={ChevronDown}
                      accessibilityLabel={`Descer ${s.name}`}
                      onPress={() => move(i, 1)}
                    />
                  ) : null}
                </View>
              }
            />
          ),
        )}
        {editing === 'new' ? (
          <ServiceForm
            saving={saving}
            onCancel={() => setEditing(null)}
            onSave={(v) =>
              run(async () => {
                await data.profile.createService({ ...v, position: services.length, active: true });
                return data.profile.listServices();
              }, 'Serviço adicionado.')
            }
          />
        ) : (
          <Button
            label="Adicionar serviço"
            variant="ghost"
            icon={Plus}
            onPress={() => setEditing('new')}
            style={{ backgroundColor: t.colors.surfaceAlt }}
          />
        )}
      </View>
    </Section>
  );
}

function HoursSection({ initial }: { initial: Week }) {
  const t = useTheme();
  const [week, setWeek] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const problem = validateWeek(week);
    if (problem) return setError(problem);
    setSaving(true);
    try {
      await data.profile.replaceWorkingHours({ items: weekToWorkingHours(week) });
      showToast('Horários salvos.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Horário de atendimento">
      <View style={{ padding: t.spacing.sm, gap: t.spacing.md }}>
        <WeekEditor
          value={week}
          onChange={(w) => {
            setWeek(w);
            setError(null);
          }}
          error={error}
        />
        <Button label="Salvar horários" onPress={save} loading={saving} />
      </View>
    </Section>
  );
}

function TimeOffSection({ initial }: { initial: TimeOff[] }) {
  const t = useTheme();
  const [items, setItems] = useState(initial);
  const [day, setDay] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function add() {
    const date = parse(day, 'dd/MM/yyyy', new Date());
    if (day.length !== 10 || !isValid(date)) return setError('Use o formato dd/mm/aaaa.');
    setSaving(true);
    setError(null);
    try {
      // the whole day in the salon, whatever the phone's timezone
      const ymd = format(date, 'yyyy-MM-dd');
      const created = await data.profile.createTimeOff({
        startsAt: salonInstant(ymd, 0).toISOString(),
        endsAt: salonInstant(ymd, 24 * 60).toISOString(),
        reason: reason.trim() || null,
      });
      setItems((cur) => [...cur, created].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
      setDay('');
      setReason('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await data.profile.deleteTimeOff(id);
      setItems((cur) => cur.filter((x) => x.id !== id));
    } catch (e) {
      showToast(errorMessage(e), 'danger');
    }
  }

  return (
    <Section title="Folgas e feriados" subtitle="Nesses dias a IA não marca ninguém.">
      <View style={{ padding: t.spacing.sm, gap: t.spacing.sm }}>
        {items.length === 0 ? (
          <Text color="textMuted">Nenhuma folga marcada.</Text>
        ) : (
          items.map((x) => (
            <ListItem
              key={x.id}
              icon={TreePalm}
              title={format(salonClock(x.startsAt), 'dd/MM/yyyy')}
              subtitle={x.reason ?? undefined}
              chevron={false}
              right={
                <IconButton
                  icon={Trash}
                  color="danger"
                  accessibilityLabel="Remover folga"
                  onPress={() => remove(x.id)}
                />
              }
            />
          ))
        )}
        <TextField
          label="Dia"
          value={day}
          onChangeText={(v) => {
            const d = v.replace(/\D/g, '').slice(0, 8);
            setDay([d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('/'));
            setError(null);
          }}
          placeholder="dd/mm/aaaa"
          keyboardType="number-pad"
          error={error}
        />
        <TextField
          label="Motivo (opcional)"
          value={reason}
          onChangeText={setReason}
          placeholder="Feriado, viagem…"
          maxLength={200}
        />
        <Button
          label="Adicionar folga"
          variant="secondary"
          icon={Plus}
          onPress={add}
          loading={saving}
        />
      </View>
    </Section>
  );
}
