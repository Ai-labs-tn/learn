import { AuthMethods, DataTable, Pagination, Sidebar, TopBar, type Column, type NavItem } from '@agiler/ui';
import { useState } from 'react';

/** Learning simulators (the app's domain layer, exposed to screens through the scaffold). */
export { BootSimulator } from '../simulator/boot/BootSimulator';
export { JvmRuntime } from '../simulator/jvm/JvmRuntime';
export { BytecodeStepper } from '../simulator/jvm/BytecodeStepper';
export { DsaVisualizer } from '../simulator/dsa/DsaVisualizer';

/** Brand block — the only place this app writes markup of its own. */
export function Brand() {
  return <strong>Learn — JVM-Lens</strong>;
}

/** The learning tracks shipped so far (Phase 3 — DSA — lands next). */
export type TrackId = 'boot-os' | 'jvm-runtime' | 'bytecode-stepper' | 'write-your-own' | 'dsa';

export const NAV_ITEMS: NavItem[] = [
  { label: 'Boot & OS', to: '/boot-os' },
  { label: 'JVM runtime', to: '/jvm-runtime' },
  { label: 'Bytecode stepper', to: '/bytecode-stepper' },
  { label: 'Write your own', to: '/write-your-own' },
  { label: 'DSA', to: '/dsa' },
];


/** Sidebar with its required `brand` wiring supplied. */
export function AppSidebar(props: Omit<Parameters<typeof Sidebar>[0], 'brand'>) {
  return <Sidebar brand={<Brand />} {...props} />;
}

/** Top bar with the app title wired in. */
export function AppTopBar(props: Omit<Parameters<typeof TopBar>[0], 'title'>) {
  return <TopBar title="Learn — JVM-Lens" {...props} />;
}

/** Deterministic table wiring: one column set per feature, records still to be fetched. */
const TABLE_COLUMNS: Record<string, string[]> = {
  "simulator-engine": ["name", "status", "owner", "notes"],
  "boot-os-simulator": ["name", "status", "owner", "notes"],
  "jvm-runtime-visualizer": ["name", "status", "owner", "notes"],
  "bytecode-stepper": ["name", "status", "owner", "notes"],
  "dsa-visualizer": ["name", "status", "owner", "notes"],
  "code-editor": ["name", "status", "owner", "notes"],
  "lesson-tracks": ["name", "status", "owner", "notes"],
  "progress-tracking": ["name", "status", "owner", "notes"]
};

export function useTableData(feature: string) {
  const [rows] = useState<Record<string, unknown>[]>([]);
  const fields = TABLE_COLUMNS[feature] ?? TABLE_COLUMNS[Object.keys(TABLE_COLUMNS)[0]] ?? [];
  const columns: Column<Record<string, unknown>>[] = fields.map((field) => ({
    key: field,
    header: field,
    accessor: (row) => String(row[field] ?? '-'),
    sortable: true,
  }));
  return { columns, data: rows, getRowId: (row: Record<string, unknown>) => String(row.id ?? '') };
}

/** DataTable with its required columns/data/getRowId wiring supplied. */
export function AppDataTable({
  feature,
  ...props
}: Omit<Parameters<typeof DataTable>[0], 'columns' | 'data' | 'getRowId'> & { feature: string }) {
  const wiring = useTableData(feature);
  return <DataTable {...wiring} {...props} />;
}

/** Pagination with its callback wired to local state. */
export function AppPagination({
  totalItems = 0,
  ...props
}: Omit<Parameters<typeof Pagination>[0], 'onPageChange' | 'page'>) {
  const [page, setPage] = useState(1);
  return (
    <Pagination
      page={page}
      totalItems={totalItems}
      onPageChange={setPage}
      {...props}
    />
  );
}

/** Auth wiring: the sign-in screen's callbacks, wired to this app's /api/auth endpoints. */
export function AppAuthMethods(
  props: Omit<
    Parameters<typeof AuthMethods>[0],
    'onRequestCode' | 'onVerifyCode' | 'onPasswordSignIn' | 'onResetPassword' | 'onRequestResetCode'
  >,
) {
  const [error, setError] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resetDevCode, setResetDevCode] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const post = async (path: string, body: unknown): Promise<Record<string, unknown>> => {
    const response = await fetch(`/api/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`auth/${path} failed`);
    return (await response.json()) as Record<string, unknown>;
  };

  const run = async (action: () => Promise<void>, failure: string) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await action();
    } catch {
      setError(failure);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onRequestCode = (email: string) =>
    run(async () => {
      setIdentifier(email);
      const challenge = await post('otp/request', { identifier: email });
      setDevCode(typeof challenge.devCode === 'string' ? challenge.devCode : null);
    }, 'We could not send a code right now.');

  const onVerifyCode = (code: string) =>
    run(async () => {
      await post('otp/verify', { identifier, code });
    }, 'That code did not match.');

  const onPasswordSignIn = (email: string, password: string) =>
    run(async () => {
      setIdentifier(email);
      const session = await post('login', { email, password });
      if (typeof session.accessToken === 'string') {
        window.localStorage.setItem('accessToken', session.accessToken);
      }
    }, 'That username/email and password did not match.');

  const onRequestResetCode = (email: string) =>
    run(async () => {
      setIdentifier(email);
      const challenge = await post('password/forgot', { identifier: email });
      setResetDevCode(typeof challenge.devCode === 'string' ? challenge.devCode : null);
    }, 'We could not start a password reset right now.');

  const onResetPassword = (email: string, code: string, newPassword: string) =>
    run(async () => {
      await post('password/reset', { identifier: email, code, newPassword });
    }, 'We could not reset that password.');

  return (
    <AuthMethods
      {...props}
      error={error}
      devCode={devCode}
      resetDevCode={resetDevCode}
      isSubmitting={isSubmitting}
      onRequestCode={onRequestCode}
      onVerifyCode={onVerifyCode}
      onPasswordSignIn={onPasswordSignIn}
      onRequestResetCode={onRequestResetCode}
      onResetPassword={onResetPassword}
    />
  );
}
