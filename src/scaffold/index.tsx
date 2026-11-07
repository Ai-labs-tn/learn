import React from 'react';
import { AuthMethods, DataTable, Pagination, Sidebar, TopBar, type Column, type NavItem } from '@agiler/ui';
import { useState } from 'react';
import { SKILLS, skillPath } from '../learning/catalog';
import { JOURNEYS } from '../computerBasics/journeys';

/** Learning simulators (the app's domain layer, exposed to screens through the scaffold). */
export { BootSimulator } from '../simulator/boot/BootSimulator';
export { HardwareStory } from '../computerBasics/HardwareStory';
export { JvmRuntime } from '../simulator/jvm/JvmRuntime';
export { BytecodeStepper } from '../simulator/jvm/BytecodeStepper';
export { DsaVisualizer } from '../simulator/dsa/DsaVisualizer';
export { PublishedLessons } from '../lessons/LessonReader';

/** Brand block — the only place this app writes markup of its own. */
export function Brand() {
  return <strong>Learn with Saravana</strong>;
}

/** Skill areas are primary; existing content tools remain available without further development. */
export type TrackId = 'desktop-startup' | 'chrome-launch' | 'java-machine' | 'inside-machine' | 'boot-os' | 'jvm-runtime' | 'bytecode-stepper' | 'write-your-own' | 'dsa' | 'lessons';

export const NAV_ITEMS: NavItem[] = [
  ...SKILLS.map((skill) => ({ label: skill.title, to: skillPath(skill.id), group: 'Skills' })),
  { label: 'Lesson library', to: '/lessons', group: 'Existing tools' },
];


/** Sidebar with its required `brand` wiring supplied. */
export function AppSidebar(props: Omit<Parameters<typeof Sidebar>[0], 'brand'>) {
  return <Sidebar brand={<Brand />} {...props} />;
}

/** Top bar with the app title wired in. */
export function AppTopBar(props: Omit<Parameters<typeof TopBar>[0], 'title'>) {
  return <TopBar title="Learn with Saravana" {...props} />;
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

/** Collapsible “Computer Basics” navigation – shows the six scenes for the chapter.
 *  Closed by default; clicking the label toggles the list open/closed.
 *  Uses the existing journey step captions, so no new data is required. */
export function ComputerBasicsNav() {
  const [open, setOpen] = useState(false);
  const sceneTitles = JOURNEYS['desktop-startup']?.steps.map((step) => step.caption) ?? [];
  return (
    <div
      className="computer-basics-nav"
      style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
      onClick={() => setOpen(!open)}
    >
      <span style={{ marginRight: 6 }}>Computer Basics</span>
      <svg
        viewBox="0 0 24 24"
        width={16}
        height={16}
        style={{ marginLeft: 8, transition: 'transform 180ms ease' }}
        aria-label="Expand computer basics scenes"
      >
        <path
          d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"
          fill={open ? 'currentColor' : 'var(--color-text-muted)'}
        />
      </svg>
      {open && (
        <ul
          className="computer-basics-nav-list"
          style={{
            position: 'absolute',
            marginTop: 8,
            left: 0,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border-strong)',
            borderRadius: 4,
            padding: '6px 10px',
            minWidth: 200,
            zIndex: 1000,
            listStyle: 'none',
            marginBottom: 4,
          }}
        >
          {sceneTitles.map((title, i) => (
            <li
              key={i}
              style={{
                padding: '4px 8px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                color: 'var(--color-text-primary)',
              }}
            >
              {title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
