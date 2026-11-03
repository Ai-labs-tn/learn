import { Button } from '@agiler/ui';
import { useState } from 'react';

/**
 * DSA visualizer — the three structure simulators on the lecturer's whiteboard: a binary search
 * tree, bubble sort and a hash map, each a single-viewport lecture (spoken caption, agenda
 * tabs, camera following the hot element on phones).
 */

import { Whiteboard, type WhiteboardStep } from '../whiteboard/Whiteboard';
import { BST_TIMELINE } from './bstTimeline';
import { HASH_TIMELINE } from './hashTimeline';
import { SORT_TIMELINE } from './sortTimeline';
import type { DsaStep, TopicId, TreeView } from './types';
import styles from './DsaVisualizer.module.css';

/* --- Board helpers (viewBox 1040 × 620) ------------------------------------- */

const BOARD_W = 1040;

function nodePos(node: { x: number; y: number }): { cx: number; cy: number } {
  return { cx: 100 + node.x * 168, cy: 140 + node.y * 150 };
}

function cellPos(index: number): number {
  return 320 + index * 96;
}

function bucketY(index: number): number {
  return 108 + index * 54;
}

/** The board-space point the phone camera should centre on: the hottest element of this step. */
function dsaAnchorOf(step: DsaStep): { x: number; y: number } {
  if (step.tree) {
    const hot = step.tree.nodes.find((node) => node.state !== 'idle');
    if (hot) {
      const at = nodePos(hot);
      return { x: at.cx, y: at.cy };
    }
    return { x: 520, y: 300 };
  }
  if (step.array) {
    const hot =
      step.array.cells.find((cell) => cell.state === 'swap') ??
      step.array.cells.find((cell) => cell.state === 'compare') ??
      step.array.cells.find((cell) => cell.state === 'sorted');
    const index = hot ? hot.index : 2;
    return { x: cellPos(index) + 44, y: 330 };
  }
  if (step.hash) {
    const bucket = step.hash.slots.find((slot) => slot.items.some((item) => item.state !== 'idle'));
    return { x: 560, y: bucketY(bucket ? bucket.index : 0) + 20 };
  }
  return { x: 520, y: 310 };
}

const NODE_FILL: Record<string, { fill: string; stroke: string; text: string }> = {
  idle: { fill: 'var(--color-surface)', stroke: 'var(--color-border)', text: 'var(--color-text-secondary)' },
  compare: { fill: 'var(--color-primary-soft)', stroke: 'var(--color-primary)', text: 'var(--color-primary)' },
  path: { fill: 'var(--color-surface)', stroke: 'var(--color-primary)', text: 'var(--color-primary)' },
  placed: { fill: 'var(--color-success-soft)', stroke: 'var(--color-success)', text: 'var(--color-success)' },
  new: { fill: 'var(--color-success-soft)', stroke: 'var(--color-success)', text: 'var(--color-success)' },
  found: { fill: 'var(--color-success-soft)', stroke: 'var(--color-success)', text: 'var(--color-success)' },
  visiting: { fill: 'var(--color-warning-soft)', stroke: 'var(--color-warning)', text: 'var(--color-warning)' },
};

function StatsChalk({ step }: { step: DsaStep }) {
  if (step.stats.length === 0) return null;
  const text = step.stats.map((stat) => `${stat.label}: ${stat.value}`).join('   ·   ');
  return (
    <text
      x={1000} y={96} textAnchor="end" fontSize={13}
      fill="var(--color-text-secondary)"
      fontFamily="var(--font-family-mono, ui-monospace, Menlo, Consolas, monospace)"
    >
      {text}
    </text>
  );
}

/* --- BST --------------------------------------------------------------------- */

function TreeCanvas({ view, step }: { view: TreeView | undefined; step: DsaStep }) {
  const byId = new Map((view?.nodes ?? []).map((node) => [node.id, node]));
  return (
    <svg className={styles.canvas} viewBox="0 0 1040 620" role="img" aria-label="The binary search tree, sketched in ink">
      <StatsChalk step={step} />
      {(view?.edges ?? []).map((edge) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to) return null;
        const a = nodePos(from);
        const b = nodePos(to);
        return (
          <line
            key={`${edge.from}-${edge.to}`}
            x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy}
            stroke={edge.state === 'path' ? 'var(--color-primary)' : 'var(--color-border)'}
            strokeWidth={edge.state === 'path' ? 2.4 : 2}
            strokeDasharray={edge.state === 'path' ? '5 4' : undefined}
          />
        );
      })}
      {(view?.nodes ?? []).map((node) => {
        const at = nodePos(node);
        const palette = NODE_FILL[node.state] ?? NODE_FILL.idle;
        return (
          <g key={node.id}>
            <rect
              x={at.cx - 42} y={at.cy - 30} width={84} height={60} rx={10}
              fill={palette.fill} stroke={palette.stroke} strokeWidth={2.4}
            />
            <text x={at.cx} y={at.cy + 6} textAnchor="middle" fontSize={17} fill={palette.text} fontWeight={600}>
              {node.value}
            </text>
            {node.note && (
              <text x={at.cx} y={at.cy + 48} textAnchor="middle" fontSize={10.5} fill="var(--color-text-muted)">
                {node.note}
              </text>
            )}
          </g>
        );
      })}
      {(view?.nodes ?? []).length === 0 && (
        <text x={520} y={300} textAnchor="middle" fontSize={14} fill="var(--color-text-muted)">
          an empty tree — waiting for its first value
        </text>
      )}
    </svg>
  );
}

/* --- Bubble sort --------------------------------------------------------------- */

function SortCanvas({ step }: { step: DsaStep }) {
  const view = step.array;
  const stateStyle = (state: string): { fill: string; stroke: string; text: string } => {
    if (state === 'swap') return { fill: 'var(--color-warning-soft)', stroke: 'var(--color-warning)', text: 'var(--color-warning)' };
    if (state === 'compare') return { fill: 'var(--color-primary-soft)', stroke: 'var(--color-primary)', text: 'var(--color-primary)' };
    if (state === 'sorted') return { fill: 'var(--color-success-soft)', stroke: 'var(--color-success)', text: 'var(--color-success)' };
    return { fill: 'var(--color-surface)', stroke: 'var(--color-border)', text: 'var(--color-text-primary)' };
  };
  return (
    <svg className={styles.canvas} viewBox="0 0 1040 620" role="img" aria-label="The array, sketched in ink">
      <StatsChalk step={step} />
      <text x={520} y={220} textAnchor="middle" fontSize={12} fill="var(--color-text-secondary)">
        one contiguous block — index i lives at base + i × 4 bytes
      </text>
      {(view?.pointers ?? []).map((pointer) => (
        <g key={pointer.name}>
          <rect
            x={cellPos(pointer.index) + 14} y={236} width={60} height={26} rx={13}
            fill="var(--color-primary-soft)" stroke="var(--color-primary)" strokeWidth={1.5}
          />
          <text x={cellPos(pointer.index) + 44} y={253} textAnchor="middle" fontSize={11} fill="var(--color-primary)" fontWeight={600}>
            {pointer.name}
          </text>
        </g>
      ))}
      {(view?.cells ?? []).map((cell) => {
        const palette = stateStyle(cell.state);
        return (
          <g key={cell.index}>
            <rect
              x={cellPos(cell.index)} y={290} width={88} height={76} rx={8}
              fill={palette.fill} stroke={palette.stroke} strokeWidth={2.4}
            />
            <text x={cellPos(cell.index) + 44} y={338} textAnchor="middle" fontSize={19} fill={palette.text} fontWeight={600}>
              {cell.value}
            </text>
            <text x={cellPos(cell.index) + 44} y={392} textAnchor="middle" fontSize={11} fill="var(--color-text-muted)">
              [{cell.index}]
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* --- Hash map -------------------------------------------------------------------- */

function HashCanvas({ step }: { step: DsaStep }) {
  const view = step.hash;
  const itemStyle = (state: string): { stroke: string; text: string; fill: string } => {
    if (state === 'new' || state === 'found') return { stroke: 'var(--color-success)', text: 'var(--color-success)', fill: 'var(--color-success-soft)' };
    if (state === 'probe') return { stroke: 'var(--color-warning)', text: 'var(--color-warning)', fill: 'var(--color-warning-soft)' };
    return { stroke: 'var(--color-border)', text: 'var(--color-text-secondary)', fill: 'var(--color-surface)' };
  };
  return (
    <svg className={styles.canvas} viewBox="0 0 1040 620" role="img" aria-label="The hash map, sketched in ink">
      <StatsChalk step={step} />
      {view?.hashOf && (
        <text x={520} y={80} textAnchor="middle" fontSize={14} fill="var(--color-primary)" fontWeight={600}>
          hash("{view.hashOf.key}") % 8 = {view.hashOf.bucket}
        </text>
      )}
      {(view?.slots ?? []).map((slot) => {
        const y = bucketY(slot.index);
        let x = 296;
        return (
          <g key={slot.index}>
            <text x={262} y={y + 22} textAnchor="end" fontSize={12} fill="var(--color-text-muted)">
              {slot.index}
            </text>
            {slot.items.length === 0 && (
              <text x={296} y={y + 22} fontSize={11} fill="var(--color-text-muted)">
                ·
              </text>
            )}
            {slot.items.map((item, position) => {
              const palette = itemStyle(item.state);
              const width = item.key.length * 7 + item.value.length * 6.4 + 30;
              const node = (
                <g key={item.key}>
                  {position > 0 && (
                    <text x={x - 14} y={y + 22} fontSize={12} fill="var(--color-text-muted)">
                      →
                    </text>
                  )}
                  <rect
                    x={x} y={y} width={width} height={34} rx={7}
                    fill={palette.fill} stroke={palette.stroke} strokeWidth={1.8}
                  />
                  <text x={x + 10} y={y + 22} fontSize={11} fill={palette.text} fontWeight={600}>
                    {item.key}
                    <tspan fill="var(--color-text-muted)" fontWeight={400}>
                      {'  →  '}{item.value}
                    </tspan>
                  </text>
                </g>
              );
              x += width + 26;
              return node;
            })}
          </g>
        );
      })}
    </svg>
  );
}

/* --- Topic switcher + whiteboards ------------------------------------------------- */

function asWhiteboardSteps(steps: DsaStep[], topic: TopicId): Array<DsaStep & WhiteboardStep> {
  // Chapter-level agenda: collapse per-step phases into their chapter ('Insert 40' → 'Insert').
  const chapter = (raw: string): string => {
    if (topic === 'bst') return raw.split(' ')[0];
    if (topic === 'hash') return raw.startsWith('put') ? 'put' : raw.startsWith('get') ? 'get' : raw;
    return raw;
  };
  return steps.map((step) => ({ ...step, caption: step.narration, phase: chapter(step.phase) }));
}

export function DsaVisualizer() {
  const [topic, setTopic] = useState<TopicId>('bst');
  const topics: Array<{ id: TopicId; label: string }> = [
    { id: 'bst', label: 'Binary search tree' },
    { id: 'sort', label: 'Bubble sort' },
    { id: 'hash', label: 'Hash map' },
  ];

  return (
    <div className={styles.wrap}>
      <div className={styles.topics}>
        {topics.map((candidate) => (
          <Button
            key={candidate.id}
            variant={candidate.id === topic ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setTopic(candidate.id)}
          >
            {candidate.label}
          </Button>
        ))}
      </div>
      {topic === 'bst' && (
        <Whiteboard
          key="bst"
          title="Binary search tree"
          steps={asWhiteboardSteps(BST_TIMELINE, 'bst')}
          anchorFor={(sim) => dsaAnchorOf(sim.current as DsaStep)}
          renderCanvas={(sim) => <TreeCanvas view={sim.current.tree} step={sim.current} />}
        />
      )}
      {topic === 'sort' && (
        <Whiteboard
          key="sort"
          title="Bubble sort"
          steps={asWhiteboardSteps(SORT_TIMELINE, 'sort')}
          anchorFor={(sim) => dsaAnchorOf(sim.current as DsaStep)}
          renderCanvas={(sim) => <SortCanvas step={sim.current} />}
        />
      )}
      {topic === 'hash' && (
        <Whiteboard
          key="hash"
          title="Hash map"
          steps={asWhiteboardSteps(HASH_TIMELINE, 'hash')}
          anchorFor={(sim) => dsaAnchorOf(sim.current as DsaStep)}
          renderCanvas={(sim) => <HashCanvas step={sim.current} />}
        />
      )}
    </div>
  );
}