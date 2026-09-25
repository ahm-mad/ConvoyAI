// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useMemo } from 'react';
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import AnimatedEdge from './AnimatedEdge';

const edgeTypes = {
  animated: AnimatedEdge,
};

// const nodeWidth = 172;
const nodeHeight = 36;

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const getLayoutedElements = (nodes, edges, direction = 'TB') => {
  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach(node => {
    const label =
      typeof node.data?.label === 'string'
        ? node.data.label
        : node.data?.label?.props?.children || '';

    // Estimate width (8px per char, min 80, max 300 for safety)
    const estWidth = Math.min(300, Math.max(80, String(label).length * 8));
    const estHeight = 40; // small padding for multi-line

    dagreGraph.setNode(node.id, { width: estWidth, height: estHeight });
  });

  edges.forEach(edge => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach(node => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = isHorizontal ? 'left' : 'top';
    node.sourcePosition = isHorizontal ? 'right' : 'bottom';
    node.position = {
      x: nodeWithPosition.x - nodeWithPosition.width / 2,
      y: nodeWithPosition.y - nodeWithPosition.height / 2,
    };

    // sync style width/height to match layout
    node.style = {
      ...node.style,
      width: nodeWithPosition.width,
      height: nodeWithPosition.height,
    };
  });

  return { nodes, edges };
};

export default function FlowChart({ data }) {
  const { nodes, edges } = useMemo(() => {
    const nodes = [];
    const edges = [];

    const traverse = (node, parent = null) => {
      const label = node.name || node.title || node.label || 'Unnamed';

      nodes.push({
        id: node.key,
        data: {
          label: (
            <div
              style={{
                whiteSpace: 'normal', // allow wrapping
                wordBreak: 'break-word', // break long words
                textAlign: 'center', // optional, center text
              }}
            >
              {label}
            </div>
          ),
        },
        position: { x: 0, y: 0 },
        style: {
          height: nodeHeight,
          border: '1px solid var(--color-line)',
          borderRadius: 8,
          padding: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-surface-2)',
          color: 'var(--color-ink-0)',
          fontSize: 12,
        },
      });

      if (parent) {
        edges.push({
          id: `${parent.key}_${node.key}`,
          source: parent.key,
          target: node.key,
          type: 'animated',
        });
      }

      if (node.children && node.children.length) {
        node.children.forEach(child => traverse(child, node));
      }
    };

    data.forEach(rootNode => traverse(rootNode));
    return getLayoutedElements(nodes, edges);
  }, [data]);

  return (
    <div className="w-full h-full bg-surface-1 rounded-xl border border-line overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        animated={true}
        nodesDraggable={false}
        zoomOnScroll
        panOnScroll
        edgeTypes={edgeTypes}
        proOptions={{ hideAttribution: true }}
      >
        <MiniMap
          style={{ backgroundColor: 'var(--color-surface-2)' }}
          maskColor="rgba(6,8,15,0.55)"
          nodeColor="var(--color-line)"
        />
        <Controls
          style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-ink-0)' }}
        />
        <Background gap={12} size={1} color="var(--color-line)" />
      </ReactFlow>
    </div>
  );
}
