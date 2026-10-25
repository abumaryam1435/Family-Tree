import { Person } from '../types/family';

export interface GenerationColorTheme {
  depth: number;
  label: string;
  bgStart: string;
  bgEnd: string;
  border: string;
  badgeBg: string;
  badgeText: string;
  nameText: string;
  subText: string;
  divider: string;
  connector: string;
  swatch: string;
}

const GENERATION_PALETTES: Omit<GenerationColorTheme, 'depth' | 'label'>[] = [
  // الجيل 1: الأصل الراسخ (Royal Emerald & Gold)
  {
    bgStart: '#093829',
    bgEnd: '#0F4C3A',
    border: '#D4AF37',
    badgeBg: '#D4AF37',
    badgeText: '#0F291E',
    nameText: '#FFFFFF',
    subText: '#FDE68A',
    divider: 'rgba(212, 175, 55, 0.42)',
    connector: '#0F4C3A',
    swatch: '#0F4C3A'
  },
  // الجيل 2: أزرق ملكي (Royal Blue)
  {
    bgStart: '#F0F7FF',
    bgEnd: '#DBEAFE',
    border: '#1D4ED8',
    badgeBg: '#1D4ED8',
    badgeText: '#FFFFFF',
    nameText: '#0F172A',
    subText: '#1E40AF',
    divider: 'rgba(29, 78, 216, 0.24)',
    connector: '#1D4ED8',
    swatch: '#1D4ED8'
  },
  // الجيل 3: كهرماني ذهبي (Amber / Bronze)
  {
    bgStart: '#FFFDF0',
    bgEnd: '#FEF3C7',
    border: '#B45309',
    badgeBg: '#B45309',
    badgeText: '#FFFFFF',
    nameText: '#1C1917',
    subText: '#92400E',
    divider: 'rgba(180, 83, 9, 0.24)',
    connector: '#B45309',
    swatch: '#D97706'
  },
  // الجيل 4: بنفسجي ملكي (Regal Violet)
  {
    bgStart: '#F8F5FF',
    bgEnd: '#EDE9FE',
    border: '#6D28D9',
    badgeBg: '#6D28D9',
    badgeText: '#FFFFFF',
    nameText: '#1E1B4B',
    subText: '#5B21B6',
    divider: 'rgba(109, 40, 217, 0.24)',
    connector: '#6D28D9',
    swatch: '#7C3AED'
  },
  // الجيل 5: فيروزي داكن (Deep Teal)
  {
    bgStart: '#F0FDFA',
    bgEnd: '#CCFBF1',
    border: '#0F766E',
    badgeBg: '#0F766E',
    badgeText: '#FFFFFF',
    nameText: '#042F2E',
    subText: '#115E59',
    divider: 'rgba(15, 118, 110, 0.24)',
    connector: '#0F766E',
    swatch: '#0D9488'
  },
  // الجيل 6: عنابي ياقوتي (Ruby Crimson)
  {
    bgStart: '#FFF1F2',
    bgEnd: '#FFE4E6',
    border: '#BE123C',
    badgeBg: '#BE123C',
    badgeText: '#FFFFFF',
    nameText: '#1F2937',
    subText: '#9F1239',
    divider: 'rgba(190, 18, 60, 0.24)',
    connector: '#BE123C',
    swatch: '#E11D48'
  },
  // الجيل 7: زيتوني أخضر (Olive Forest)
  {
    bgStart: '#F7FEE7',
    bgEnd: '#ECFCCB',
    border: '#3F6212',
    badgeBg: '#3F6212',
    badgeText: '#FFFFFF',
    nameText: '#1A2E05',
    subText: '#365314',
    divider: 'rgba(63, 98, 18, 0.24)',
    connector: '#3F6212',
    swatch: '#65A30D'
  },
  // الجيل 8: نيلي داكن (Indigo)
  {
    bgStart: '#EEF2FF',
    bgEnd: '#E0E7FF',
    border: '#3730A3',
    badgeBg: '#3730A3',
    badgeText: '#FFFFFF',
    nameText: '#1E1B4B',
    subText: '#312E81',
    divider: 'rgba(55, 48, 163, 0.24)',
    connector: '#3730A3',
    swatch: '#4F46E5'
  },
  // الجيل 9: نحاسي دافئ (Terracotta)
  {
    bgStart: '#FFF7ED',
    bgEnd: '#FFEDD5',
    border: '#C2410C',
    badgeBg: '#C2410C',
    badgeText: '#FFFFFF',
    nameText: '#271306',
    subText: '#9A3412',
    divider: 'rgba(194, 65, 12, 0.24)',
    connector: '#C2410C',
    swatch: '#EA580C'
  },
  // الجيل 10: زمردي (Emerald)
  {
    bgStart: '#ECFDF5',
    bgEnd: '#D1FAE5',
    border: '#047857',
    badgeBg: '#047857',
    badgeText: '#FFFFFF',
    nameText: '#064E3B',
    subText: '#065F46',
    divider: 'rgba(4, 120, 87, 0.24)',
    connector: '#047857',
    swatch: '#10B981'
  }
];

export function getGenerationColorTheme(depth: number): GenerationColorTheme {
  const idx = depth <= 1 ? 0 : ((depth - 2) % (GENERATION_PALETTES.length - 1)) + 1;
  const base = GENERATION_PALETTES[idx];
  return {
    ...base,
    depth,
    label: depth === 1 ? 'الجيل 1 (الأصل الراسخ)' : `الجيل ${depth}`
  };
}

export interface VerticalPyramidNode {
  person: Person;
  depth: number;
  x: number; // Center X of card
  y: number; // Center Y of card
  width: number;
  height: number;
  hasVisibleChildren: boolean;
  isCollapsed: boolean;
  maleChildrenCount: number;
  femaleChildrenCount: number;
  totalDirectChildren: number;
  theme: GenerationColorTheme;
}

export interface VerticalPyramidLink {
  id: string;
  parentId: string;
  childId: string;
  depth: number;
  color: string;
  points: { x: number; y: number }[];
  svgPath: string;
}

export interface VerticalPyramidLayoutResult {
  nodes: VerticalPyramidNode[];
  links: VerticalPyramidLink[];
  logicalW: number;
  logicalH: number;
  treeContentW: number;
  treeContentH: number;
  maxDepth: number;
  totalNodes: number;
  nodeW: number;
  nodeH: number;
  headerHeight: number;
  legendHeight: number;
  footerHeight: number;
  generationsList: GenerationColorTheme[];
}

interface SubtreeBox {
  person: Person;
  depth: number;
  width: number;
  height: number;
  rootCardCenterX: number; // X center of this person's card relative to subtree left (0)
  rootCardCenterY: number; // Y center of this person's card relative to subtree top (0)
  placedNodes: {
    person: Person;
    depth: number;
    relX: number; // Center X relative to subtree left
    relY: number; // Center Y relative to subtree top
    hasVisibleChildren: boolean;
    isCollapsed: boolean;
    maleChildrenCount: number;
    femaleChildrenCount: number;
    totalDirectChildren: number;
  }[];
  placedLinks: {
    id: string;
    parentId: string;
    childId: string;
    depth: number;
    color: string;
    relPoints: { x: number; y: number }[];
  }[];
}

/**
 * Computes a Vertical Space-Filling Pyramid Layout (`التخطيط الهرمي العمودي المدمج`)
 * where:
 * - Cards are arranged vertically without forcing every generation onto a single wide row.
 * - Children of each parent balance across a central vertical spine (Right column & Left column,
 *   or a single vertical column with a side spine when subtrees are already wide), guaranteeing:
 *   1. ZERO card-to-card overlaps
 *   2. ZERO connector-line-to-card intersections
 *   3. A natural Portrait (vertical sheet) aspect ratio that utilizes vertical paper space
 *   4. Distinct color coding for each generation (`تمييز كل جيل بلون معين`)
 */
export function computeVerticalPyramidLayout(options: {
  rootPerson: Person;
  getChildren: (personId: string) => Person[];
  collapsedNodes?: Set<string>;
  includeFemales?: boolean;
  forScreen?: boolean;
}): VerticalPyramidLayoutResult {
  const {
    rootPerson,
    getChildren,
    collapsedNodes = new Set<string>(),
    includeFemales = true,
    forScreen = false
  } = options;

  const getFilteredChildren = (personId: string): Person[] => {
    const all = getChildren(personId);
    return includeFemales ? all : all.filter((c) => c.gender === 'male');
  };

  // 1. Measure total visible nodes and max depth
  const visitedMeasure = new Set<string>();
  let maxDepth = 1;
  let totalNodes = 0;

  function measure(p: Person, depth: number) {
    visitedMeasure.add(p.id);
    totalNodes++;
    if (depth > maxDepth) maxDepth = depth;
    if (collapsedNodes.has(p.id)) return;
    const kids = getFilteredChildren(p.id).filter((c) => !visitedMeasure.has(c.id));
    for (const k of kids) {
      measure(k, depth + 1);
    }
  }
  measure(rootPerson, 1);

  // 2. Card sizing adapted to screen vs print export and family size
  // Slightly reduced card dimensions to eliminate excess empty space
  const NODE_W = forScreen ? 208 : totalNodes <= 20 ? 256 : totalNodes <= 55 ? 232 : 216;
  const NODE_H = forScreen ? 88 : totalNodes <= 20 ? 112 : totalNodes <= 55 ? 102 : 94;

  const SPINE_CORRIDOR = forScreen ? 28 : 34; // Clear corridor around the vertical spine line
  const V_PARENT_TO_CHILDREN = forScreen ? 28 : 36; // Vertical gap from parent card bottom to first child tier
  const V_TIER_GAP = forScreen ? 26 : 32; // Vertical gap between stacked subtrees in the same column
  const BRANCH_DROP = forScreen ? 14 : 16; // Distance above child's top edge where horizontal branch turns down

  // Maximum combined width for pairing two subtrees side-by-side before switching to single-column stacking
  // This keeps the entire family tree in a clean vertical portrait proportion!
  const maxDualPairWidth =
    totalNodes <= 15
      ? NODE_W * 3.4
      : totalNodes <= 40
      ? NODE_W * 4.2
      : NODE_W * 4.8;

  const visitedBuild = new Set<string>();

  function buildSubtree(person: Person, depth: number): SubtreeBox {
    visitedBuild.add(person.id);
    const allDirect = getChildren(person.id);
    const maleChildrenCount = allDirect.filter((c) => c.gender === 'male').length;
    const femaleChildrenCount = allDirect.filter((c) => c.gender === 'female').length;
    const isCollapsed = collapsedNodes.has(person.id);
    const visibleKids = isCollapsed
      ? []
      : getFilteredChildren(person.id).filter((c) => !visitedBuild.has(c.id));
    const hasVisibleChildren = getFilteredChildren(person.id).length > 0;
    const parentTheme = getGenerationColorTheme(depth);

    // Base case: Leaf node (or collapsed node)
    if (visibleKids.length === 0) {
      return {
        person,
        depth,
        width: NODE_W,
        height: NODE_H,
        rootCardCenterX: NODE_W / 2,
        rootCardCenterY: NODE_H / 2,
        placedNodes: [
          {
            person,
            depth,
            relX: NODE_W / 2,
            relY: NODE_H / 2,
            hasVisibleChildren,
            isCollapsed,
            maleChildrenCount,
            femaleChildrenCount,
            totalDirectChildren: allDirect.length
          }
        ],
        placedLinks: []
      };
    }

    // Recursively build child subtrees
    // Order children so leaf children (compact single cards) come first, followed by branching subtrees
    // sorted by ascending subtree size so compact branches pair cleanly at the top!
    const rawChildBoxes = visibleKids.map((ch) => buildSubtree(ch, depth + 1));
    const leafBoxes = rawChildBoxes.filter((b) => b.placedNodes.length === 1);
    const branchBoxes = rawChildBoxes.filter((b) => b.placedNodes.length > 1);
    const childBoxes = [...leafBoxes, ...branchBoxes];

    // Special Case 1: Single visible child -> place directly below parent, aligned on card centers
    if (childBoxes.length === 1) {
      const ch = childBoxes[0];
      const boxW = Math.max(NODE_W, ch.width);
      const childOffsetX =
        ch.width >= NODE_W ? 0 : (NODE_W - ch.width) / 2;
      const rootCenterX = childOffsetX + ch.rootCardCenterX;
      // Ensure parent card itself fits within [0, boxW]
      const leftExtend = Math.max(0, NODE_W / 2 - rootCenterX);
      const rightExtend = Math.max(0, rootCenterX + NODE_W / 2 - boxW);
      const finalW = boxW + leftExtend + rightExtend;
      const finalRootX = rootCenterX + leftExtend;
      const finalChildOffsetX = childOffsetX + leftExtend;
      const childOffsetY = NODE_H + V_PARENT_TO_CHILDREN;
      const finalH = childOffsetY + ch.height;

      const placedNodes: SubtreeBox['placedNodes'] = [
        {
          person,
          depth,
          relX: finalRootX,
          relY: NODE_H / 2,
          hasVisibleChildren,
          isCollapsed,
          maleChildrenCount,
          femaleChildrenCount,
          totalDirectChildren: allDirect.length
        }
      ];

      for (const pn of ch.placedNodes) {
        placedNodes.push({
          ...pn,
          relX: pn.relX + finalChildOffsetX,
          relY: pn.relY + childOffsetY
        });
      }

      const placedLinks: SubtreeBox['placedLinks'] = [
        {
          id: `vlink-${person.id}-${ch.person.id}`,
          parentId: person.id,
          childId: ch.person.id,
          depth,
          color: parentTheme.connector,
          relPoints: [
            { x: finalRootX, y: NODE_H },
            { x: finalChildOffsetX + ch.rootCardCenterX, y: childOffsetY }
          ]
        }
      ];

      for (const pl of ch.placedLinks) {
        placedLinks.push({
          ...pl,
          relPoints: pl.relPoints.map((pt) => ({
            x: pt.x + finalChildOffsetX,
            y: pt.y + childOffsetY
          }))
        });
      }

      return {
        person,
        depth,
        width: finalW,
        height: finalH,
        rootCardCenterX: finalRootX,
        rootCardCenterY: NODE_H / 2,
        placedNodes,
        placedLinks
      };
    }

    // Multiple children (childBoxes.length >= 2):
    // Check whether Dual-Column Central Spine fits within our portrait width budget
    const sortedWidths = [...childBoxes].map((c) => c.width).sort((a, b) => b - a);
    const widestPairW = (sortedWidths[0] || NODE_W) + (sortedWidths[1] || NODE_W) + SPINE_CORRIDOR;
    const useSingleColumnSideSpine =
      depth >= 3 && widestPairW > maxDualPairWidth;

    if (useSingleColumnSideSpine) {
      // ======================================================================
      // SINGLE-COLUMN VERTICAL STACK WITH RIGHT-SIDE SPINE
      // Keeps deep wide subtrees narrow by stacking children vertically to the
      // left of the parent's right-hand vertical spine corridor.
      // ======================================================================
      const maxChildW = Math.max(...childBoxes.map((c) => c.width));
      const spineX = Math.max(NODE_W / 2, maxChildW + SPINE_CORRIDOR / 2);
      const rightOvershoot = NODE_W / 2;
      const finalW = spineX + rightOvershoot;
      const childrenStartY = NODE_H + V_PARENT_TO_CHILDREN;

      const placedNodes: SubtreeBox['placedNodes'] = [
        {
          person,
          depth,
          relX: spineX,
          relY: NODE_H / 2,
          hasVisibleChildren,
          isCollapsed,
          maleChildrenCount,
          femaleChildrenCount,
          totalDirectChildren: allDirect.length
        }
      ];
      const placedLinks: SubtreeBox['placedLinks'] = [];

      let curY = childrenStartY;
      for (let i = 0; i < childBoxes.length; i++) {
        const ch = childBoxes[i];
        const isLast = i === childBoxes.length - 1;
        // If last child, can center its card under spineX if it fits within [0, finalW]
        let chOffsetX = spineX - SPINE_CORRIDOR / 2 - ch.width;
        if (isLast && spineX - ch.rootCardCenterX >= 0 && spineX - ch.rootCardCenterX + ch.width <= finalW) {
          chOffsetX = spineX - ch.rootCardCenterX;
        }

        const chOffsetY = curY;
        const chCardCenterX = chOffsetX + ch.rootCardCenterX;
        const chCardTopY = chOffsetY;
        const branchY = chCardTopY - BRANCH_DROP;

        placedLinks.push({
          id: `vlink-${person.id}-${ch.person.id}`,
          parentId: person.id,
          childId: ch.person.id,
          depth,
          color: parentTheme.connector,
          relPoints:
            Math.abs(chCardCenterX - spineX) < 1
              ? [
                  { x: spineX, y: NODE_H },
                  { x: spineX, y: chCardTopY }
                ]
              : [
                  { x: spineX, y: NODE_H },
                  { x: spineX, y: branchY },
                  { x: chCardCenterX, y: branchY },
                  { x: chCardCenterX, y: chCardTopY }
                ]
        });

        for (const pn of ch.placedNodes) {
          placedNodes.push({
            ...pn,
            relX: pn.relX + chOffsetX,
            relY: pn.relY + chOffsetY
          });
        }
        for (const pl of ch.placedLinks) {
          placedLinks.push({
            ...pl,
            relPoints: pl.relPoints.map((pt) => ({
              x: pt.x + chOffsetX,
              y: pt.y + chOffsetY
            }))
          });
        }

        curY += ch.height + V_TIER_GAP;
      }

      const finalH = curY - V_TIER_GAP;
      return {
        person,
        depth,
        width: finalW,
        height: finalH,
        rootCardCenterX: spineX,
        rootCardCenterY: NODE_H / 2,
        placedNodes,
        placedLinks
      };
    }

    // ========================================================================
    // BALANCED DUAL-COLUMN CENTRAL-SPINE PYRAMID
    // - Right column sits to the right of `spineX + SPINE_CORRIDOR / 2`
    // - Left column sits to the left of `spineX - SPINE_CORRIDOR / 2`
    // - If childBoxes.length is odd and the two columns are balanced in height,
    //   the final child sits centered at the bottom of the central spine!
    // ========================================================================
    const rightPlacements: { box: SubtreeBox; relY: number }[] = [];
    const leftPlacements: { box: SubtreeBox; relY: number }[] = [];
    let bottomCenteredPlacement: { box: SubtreeBox; relY: number } | null = null;

    let rightH = 0;
    let leftH = 0;

    for (let i = 0; i < childBoxes.length; i++) {
      const ch = childBoxes[i];
      const isLast = i === childBoxes.length - 1;

      // If this is the final child, count is odd, and Right/Left columns are reasonably balanced,
      // place this child centered directly at the bottom of the central spine for a symmetrical pyramid!
      if (isLast && childBoxes.length % 2 === 1 && Math.abs(rightH - leftH) <= NODE_H * 1.15) {
        const bottomY = Math.max(rightH, leftH);
        bottomCenteredPlacement = {
          box: ch,
          relY: bottomY
        };
        break;
      }

      // Otherwise assign to whichever side (Right first in RTL, then Left) currently has less height
      if (rightH <= leftH) {
        rightPlacements.push({ box: ch, relY: rightH });
        rightH += ch.height + V_TIER_GAP;
      } else {
        leftPlacements.push({ box: ch, relY: leftH });
        leftH += ch.height + V_TIER_GAP;
      }
    }

    const maxRightColW =
      rightPlacements.length > 0 ? Math.max(...rightPlacements.map((p) => p.box.width)) : 0;
    const maxLeftColW =
      leftPlacements.length > 0 ? Math.max(...leftPlacements.map((p) => p.box.width)) : 0;

    // Extent needed to the left and right of `spineX`
    let leftExtentFromSpine = Math.max(
      NODE_W / 2,
      maxLeftColW > 0 ? SPINE_CORRIDOR / 2 + maxLeftColW : 0
    );
    let rightExtentFromSpine = Math.max(
      NODE_W / 2,
      maxRightColW > 0 ? SPINE_CORRIDOR / 2 + maxRightColW : 0
    );

    if (bottomCenteredPlacement) {
      const bBox = bottomCenteredPlacement.box;
      leftExtentFromSpine = Math.max(leftExtentFromSpine, bBox.rootCardCenterX);
      rightExtentFromSpine = Math.max(rightExtentFromSpine, bBox.width - bBox.rootCardCenterX);
    }

    const spineX = leftExtentFromSpine;
    const finalW = leftExtentFromSpine + rightExtentFromSpine;
    const childrenStartY = NODE_H + V_PARENT_TO_CHILDREN;

    const placedNodes: SubtreeBox['placedNodes'] = [
      {
        person,
        depth,
        relX: spineX,
        relY: NODE_H / 2,
        hasVisibleChildren,
        isCollapsed,
        maleChildrenCount,
        femaleChildrenCount,
        totalDirectChildren: allDirect.length
      }
    ];
    const placedLinks: SubtreeBox['placedLinks'] = [];

    // Place Right column subtrees (aligned against spineX + SPINE_CORRIDOR / 2)
    for (const item of rightPlacements) {
      const ch = item.box;
      const chOffsetX = spineX + SPINE_CORRIDOR / 2;
      const chOffsetY = childrenStartY + item.relY;
      const chCardCenterX = chOffsetX + ch.rootCardCenterX;
      const chCardTopY = chOffsetY;
      const branchY = chCardTopY - BRANCH_DROP;

      placedLinks.push({
        id: `vlink-${person.id}-${ch.person.id}`,
        parentId: person.id,
        childId: ch.person.id,
        depth,
        color: parentTheme.connector,
        relPoints: [
          { x: spineX, y: NODE_H },
          { x: spineX, y: branchY },
          { x: chCardCenterX, y: branchY },
          { x: chCardCenterX, y: chCardTopY }
        ]
      });

      for (const pn of ch.placedNodes) {
        placedNodes.push({
          ...pn,
          relX: pn.relX + chOffsetX,
          relY: pn.relY + chOffsetY
        });
      }
      for (const pl of ch.placedLinks) {
        placedLinks.push({
          ...pl,
          relPoints: pl.relPoints.map((pt) => ({
            x: pt.x + chOffsetX,
            y: pt.y + chOffsetY
          }))
        });
      }
    }

    // Place Left column subtrees (aligned against spineX - SPINE_CORRIDOR / 2)
    for (const item of leftPlacements) {
      const ch = item.box;
      const chOffsetX = spineX - SPINE_CORRIDOR / 2 - ch.width;
      const chOffsetY = childrenStartY + item.relY;
      const chCardCenterX = chOffsetX + ch.rootCardCenterX;
      const chCardTopY = chOffsetY;
      const branchY = chCardTopY - BRANCH_DROP;

      placedLinks.push({
        id: `vlink-${person.id}-${ch.person.id}`,
        parentId: person.id,
        childId: ch.person.id,
        depth,
        color: parentTheme.connector,
        relPoints: [
          { x: spineX, y: NODE_H },
          { x: spineX, y: branchY },
          { x: chCardCenterX, y: branchY },
          { x: chCardCenterX, y: chCardTopY }
        ]
      });

      for (const pn of ch.placedNodes) {
        placedNodes.push({
          ...pn,
          relX: pn.relX + chOffsetX,
          relY: pn.relY + chOffsetY
        });
      }
      for (const pl of ch.placedLinks) {
        placedLinks.push({
          ...pl,
          relPoints: pl.relPoints.map((pt) => ({
            x: pt.x + chOffsetX,
            y: pt.y + chOffsetY
          }))
        });
      }
    }

    // Place Bottom-Centered subtree (if odd count and balanced)
    let totalChildrenH = Math.max(
      rightH > 0 ? rightH - V_TIER_GAP : 0,
      leftH > 0 ? leftH - V_TIER_GAP : 0
    );

    if (bottomCenteredPlacement) {
      const ch = bottomCenteredPlacement.box;
      const chOffsetX = spineX - ch.rootCardCenterX;
      const chOffsetY = childrenStartY + bottomCenteredPlacement.relY;
      const chCardTopY = chOffsetY;

      placedLinks.push({
        id: `vlink-${person.id}-${ch.person.id}`,
        parentId: person.id,
        childId: ch.person.id,
        depth,
        color: parentTheme.connector,
        relPoints: [
          { x: spineX, y: NODE_H },
          { x: spineX, y: chCardTopY }
        ]
      });

      for (const pn of ch.placedNodes) {
        placedNodes.push({
          ...pn,
          relX: pn.relX + chOffsetX,
          relY: pn.relY + chOffsetY
        });
      }
      for (const pl of ch.placedLinks) {
        placedLinks.push({
          ...pl,
          relPoints: pl.relPoints.map((pt) => ({
            x: pt.x + chOffsetX,
            y: pt.y + chOffsetY
          }))
        });
      }

      totalChildrenH = bottomCenteredPlacement.relY + ch.height;
    }

    const finalH = childrenStartY + totalChildrenH;

    return {
      person,
      depth,
      width: finalW,
      height: finalH,
      rootCardCenterX: spineX,
      rootCardCenterY: NODE_H / 2,
      placedNodes,
      placedLinks
    };
  }

  const rootBox = buildSubtree(rootPerson, 1);

  const HEADER_H = forScreen ? 0 : 210;
  const LEGEND_H = forScreen ? 56 : 74;
  const FOOTER_H = forScreen ? 0 : 75;
  const SIDE_PAD = forScreen ? 36 : 80;
  const TOP_PAD = forScreen ? 20 : 45;
  const BOTTOM_PAD = forScreen ? 28 : 55;

  const treeContentW = rootBox.width;
  const treeContentH = rootBox.height;

  // For export, ensure a clean Portrait sheet minimum width & height
  const minExportW = forScreen ? treeContentW + SIDE_PAD * 2 : Math.max(1320, treeContentW + SIDE_PAD * 2);
  const logicalW = Math.ceil(Math.max(minExportW, treeContentW + SIDE_PAD * 2));
  const treeTopY = HEADER_H + LEGEND_H + TOP_PAD;
  const rawLogicalH = Math.ceil(treeTopY + treeContentH + BOTTOM_PAD + FOOTER_H);
  // Keep export portrait-proportioned (height >= width * 1.15 when possible)
  const logicalH = forScreen
    ? rawLogicalH
    : Math.max(rawLogicalH, Math.min(Math.round(logicalW * 1.35), rawLogicalH + 240));

  const treeOffsetX = (logicalW - treeContentW) / 2;
  const treeOffsetY = treeTopY;

  const nodes: VerticalPyramidNode[] = rootBox.placedNodes.map((pn) => ({
    person: pn.person,
    depth: pn.depth,
    x: pn.relX + treeOffsetX,
    y: pn.relY + treeOffsetY,
    width: NODE_W,
    height: NODE_H,
    hasVisibleChildren: pn.hasVisibleChildren,
    isCollapsed: pn.isCollapsed,
    maleChildrenCount: pn.maleChildrenCount,
    femaleChildrenCount: pn.femaleChildrenCount,
    totalDirectChildren: pn.totalDirectChildren,
    theme: getGenerationColorTheme(pn.depth)
  }));

  const links: VerticalPyramidLink[] = rootBox.placedLinks.map((pl) => {
    const pts = pl.relPoints.map((pt) => ({
      x: pt.x + treeOffsetX,
      y: pt.y + treeOffsetY
    }));
    const svgPath = pts
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
      .join(' ');
    return {
      id: pl.id,
      parentId: pl.parentId,
      childId: pl.childId,
      depth: pl.depth,
      color: pl.color,
      points: pts,
      svgPath
    };
  });

  const generationsList: GenerationColorTheme[] = [];
  for (let d = 1; d <= maxDepth; d++) {
    generationsList.push(getGenerationColorTheme(d));
  }

  return {
    nodes,
    links,
    logicalW,
    logicalH,
    treeContentW,
    treeContentH,
    maxDepth,
    totalNodes,
    nodeW: NODE_W,
    nodeH: NODE_H,
    headerHeight: HEADER_H,
    legendHeight: LEGEND_H,
    footerHeight: FOOTER_H,
    generationsList
  };
}
