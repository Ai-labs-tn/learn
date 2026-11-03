import { Badge, Button, Card, ProgressBar, Stack } from '@agiler/ui';
import { useState, type ReactNode } from 'react';

/**
 * DSA visualizer (Phase 3) — three structure simulators on the shared snapshot engine:
 * a binary search tree (insert + search), bubble sort (pass by pass) and a hash map
 * (put, collision, chain, get). Each canvas shows the structure as memory: pointers,
 * indices, buckets and the live counters.
 */

import { cn } from '../../utils/cn';
import { useSimulator, type UseSimulatorResult } from '../useSimulator';
import { BST_TIMELINE } from './bstTimeline';
import { HASH_TIMELINE } from './hashTimeline';
import { SORT_TIMELINE } from './sortTimeline';
import type { DsaStep, HashView, TopicId, TreeView } from './types';
import styles from './DsaVisualizer.module.css';

/* --- Shared frame ----------------------------------------------------------- */

function Controls({ sim }: { sim: UseSimulatorResult<DsaStep> }) {
  return (
    <>
      <div className={styles.controls}>
        <Button variant="outline" size="sm" onClick={sim.prev} disabled={sim.atStart}>
          ← Prev
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={sim.toggle}
          disabled={sim.atEnd && !sim.playing}
        >
          {sim.playing ? 'Pause' : 'Play'}
        </Button>
        <Button variant="outline" size="sm" onClick={sim.next} disabled={sim.atEnd}>
          Next →
        </Button>
        <span className={styles.spacer} />
        <Button variant="ghost" size="sm" onClick={sim.reset}>
          Restart
        </Button>
      </div>
      <span className={styles.stepChip}>
        Step {sim.index + 1} of {sim.total}
      </span>
    </>
  );
}

function DsaFrame({
  sim,
  canvas,
  canvasTitle,
}: {
  sim: UseSimulatorResult<DsaStep>;
  canvas: ReactNode;
  canvasTitle: string;
}) {
  const step = sim.current;
  return (
    <div className={styles.grid}>
      <Card padding="lg">
        <div className={styles.canvasWrap}>
          <h3>{canvasTitle}</h3>
          {canvas}
        </div>
      </Card>
      <aside className={styles.side}>
        <Card padding="lg">
          <Stack gap={4}>
            <Badge variant="info" size="sm">
              {step.phase}
            </Badge>
            <h2>{step.title}</h2>
            <p>{step.narration}</p>
            {step.stats.length > 0 && (
              <div className={styles.stats}>
                {step.stats.map((stat) => (
                  <Badge key={stat.label} variant="neutral" size="sm">
                    {stat.label}: {stat.value}
                  </Badge>
                ))}
              </div>
            )}
            <ProgressBar label="Progress" value={sim.progress} size="md" />
            <Controls sim={sim} />
          </Stack>
        </Card>
      </aside>
    </div>
  );
}

/* --- Tree ------------------------------------------------------------------- */

const CELL_W = 76;
const CELL_H = 74;
const PAD = 12;

function TreeCanvas({ view }: { view: TreeView }) {
  const maxColumn = Math.max(4, ...view.nodes.map((node) => node.x));
  const maxDepth = Math.max(1, ...view.nodes.map((node) => node.y));
  const width = PAD * 2 + (maxColumn + 1) * CELL_W;
  const height = PAD * 2 + (maxDepth + 1) * CELL_H;
  const center = (node: { x: number; y: number }) => ({
    cx: PAD + node.x * CELL_W + CELL_W / 2,
    cy: PAD + node.y * CELL_H + CELL_H / 2,
  });
  const box = 46;

  const nodeStateClass = (state: string): string => {
    if (state === 'compare') return styles.nodeCompare;
    if (state === 'path') return styles.nodePath;
    if (state === 'placed' || state === 'new') return styles.nodePlaced;
    if (state === 'found') return styles.nodeFound;
    if (state === 'visiting') return styles.nodeVisiting;
    return styles.nodeIdle;
  };

  return (
    <div className={styles.treeCanvas}>
      <div className={styles.treeInner} style={{ width, height }}>
        <svg className={styles.treeEdges} viewBox={`0 0 ${width} ${height}`}>
          {view.edges.map((edge) => {
            const from = view.nodes.find((node) => node.id === edge.from);
            const to = view.nodes.find((node) => node.id === edge.to);
            if (!from || !to) return null;
            const a = center(from);
            const b = center(to);
            return (
              <line
                key={`${edge.from}-${edge.to}`}
                x1={a.cx}
                y1={a.cy}
                x2={b.cx}
                y2={b.cy}
                stroke={edge.state === 'idle' ? 'var(--color-border)' : 'var(--color-primary)'}
                strokeWidth={edge.state === 'path' ? 2 : 1.5}
                strokeDasharray={edge.state === 'path' ? '4 3' : undefined}
              />
            );
          })}
        </svg>
        {view.nodes.map((node) => {
          const at = center(node);
          return (
            <div key={node.id}>
              <span
                className={cn(styles.treeNode, nodeStateClass(node.state))}
                style={{
                  left: at.cx - box / 2,
                  top: at.cy - box / 2,
                  width: box,
                  height: box,
                }}
              >
                {node.value}
              </span>
              {node.note && (
                <span className={styles.treeNote} style={{ left: at.cx, top: at.cy + box / 2 + 4 }}>
                  {node.note}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TreeSim() {
  const sim = useSimulator(BST_TIMELINE);
  return (
    <DsaFrame
      sim={sim}
      canvasTitle="Memory: nodes with left/right pointers"
      canvas={<TreeCanvas view={sim.current.tree ?? { nodes: [], edges: [] }} />}
    />
  );
}

/* --- Array ------------------------------------------------------------------ */

const ARRAY_CELL_W = 64;

function ArrayCanvas({ view }: { view: NonNullable<DsaStep['array']> }) {
  const cellStateClass = (state: string): string => {
    if (state === 'compare') return styles.cellCompare;
    if (state === 'swap') return styles.cellSwap;
    if (state === 'sorted') return styles.cellSorted;
    return '';
  };
  return (
    <div className={styles.arrayCanvas}>
      <div className={styles.arrayInner}>
        <div className={styles.pointerRow}>
          {view.pointers.map((pointer) => (
            <span
              key={pointer.name}
              className={styles.pointerChip}
              style={{ left: pointer.index * ARRAY_CELL_W + ARRAY_CELL_W / 2 }}
            >
              {pointer.name}
            </span>
          ))}
        </div>
        <div className={styles.cellRow}>
          {view.cells.map((cell) => (
            <span
              key={cell.index}
              className={cn(styles.cell, cellStateClass(cell.state))}
              style={{ width: ARRAY_CELL_W, height: 48 }}
            >
              {cell.value}
            </span>
          ))}
        </div>
        <div className={styles.indexRow}>
          {view.cells.map((cell) => (
            <span key={cell.index} className={styles.cellIndex} style={{ width: ARRAY_CELL_W }}>
              [{cell.index}]
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SortSim() {
  const sim = useSimulator(SORT_TIMELINE);
  return (
    <DsaFrame
      sim={sim}
      canvasTitle="Memory: one contiguous block, index = base + i × 4 bytes"
      canvas={<ArrayCanvas view={sim.current.array ?? { cells: [], pointers: [] }} />}
    />
  );
}

/* --- Hash map ---------------------------------------------------------------- */

function HashCanvas({ view }: { view: HashView }) {
  return (
    <div className={styles.canvasWrap}>
      {view.hashOf && (
        <pre className={styles.hashLine}>hash("{view.hashOf.key}") % 8 = {view.hashOf.bucket}</pre>
      )}
      <div className={styles.buckets}>
        {view.slots.map((slot) => (
          <div key={slot.index} className={styles.bucket}>
            <span className={styles.bucketIndex}>{slot.index}</span>
            <div className={styles.bucketItems}>
              {slot.items.length === 0 && <span className={styles.bucketEmpty}>·</span>}
              {slot.items.map((item, position) => (
                <span key={item.key} className={styles.bucketItems}>
                  {position > 0 && <span className={styles.arrow}>→</span>}
                  <span
                    className={cn(
                      styles.item,
                      item.state === 'new' && styles.itemNew,
                      item.state === 'probe' && styles.itemProbe,
                      item.state === 'found' && styles.itemFound,
                    )}
                  >
                    <span className={styles.itemKey}>{item.key}</span>
                    <span>→ {item.value}</span>
                  </span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HashSim() {
  const sim = useSimulator(HASH_TIMELINE);
  return (
    <DsaFrame
      sim={sim}
      canvasTitle="Memory: an array of buckets; chains handle collisions"
      canvas={<HashCanvas view={sim.current.hash ?? { slots: [] }} />}
    />
  );
}

/* --- Switcher ----------------------------------------------------------------- */

export function DsaVisualizer() {
  const [topic, setTopic] = useState<TopicId>('bst');
  const topics: Array<{ id: TopicId; label: string }> = [
    { id: 'bst', label: 'Binary search tree' },
    { id: 'sort', label: 'Bubble sort' },
    { id: 'hash', label: 'Hash map' },
  ];

  return (
    <div>
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
      {topic === 'bst' && <TreeSim key="bst" />}
      {topic === 'sort' && <SortSim key="sort" />}
      {topic === 'hash' && <HashSim key="hash" />}
    </div>
  );
}
