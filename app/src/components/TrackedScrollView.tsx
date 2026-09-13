import { useCallback, useEffect, useRef } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  ScrollViewProps,
} from 'react-native';

export const scrollDepthThresholds = [25, 50, 75, 100] as const;

export type ScrollDepthPercent = (typeof scrollDepthThresholds)[number];

export function newlyReachedScrollDepths(
  contentOffsetY: number,
  viewportHeight: number,
  contentHeight: number,
  reached: ReadonlySet<ScrollDepthPercent>,
): ScrollDepthPercent[] {
  if (contentHeight <= 0 || viewportHeight <= 0) {
    return [];
  }

  const depth = Math.min(
    100,
    Math.max(0, ((contentOffsetY + viewportHeight) / contentHeight) * 100),
  );
  return scrollDepthThresholds.filter(
    threshold => depth >= threshold && !reached.has(threshold),
  );
}

type Props = ScrollViewProps & {
  trackingResetKey: string;
  onScrollDepth: (depth: ScrollDepthPercent) => void;
};

export function TrackedScrollView({
  trackingResetKey,
  onScrollDepth,
  onScroll,
  scrollEventThrottle = 200,
  ...scrollViewProps
}: Props) {
  const handleScroll = useScrollDepthTracking(
    trackingResetKey,
    onScrollDepth,
    onScroll,
  );

  return (
    <ScrollView
      {...scrollViewProps}
      onScroll={handleScroll}
      scrollEventThrottle={scrollEventThrottle}
    />
  );
}

export function useScrollDepthTracking(
  trackingResetKey: string,
  onScrollDepth: (depth: ScrollDepthPercent) => void,
  onScroll?: ScrollViewProps['onScroll'],
) {
  const reached = useRef(new Set<ScrollDepthPercent>());

  useEffect(() => {
    reached.current.clear();
  }, [trackingResetKey]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      onScroll?.(event);
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      const newDepths = newlyReachedScrollDepths(
        contentOffset.y,
        layoutMeasurement.height,
        contentSize.height,
        reached.current,
      );
      newDepths.forEach(depth => {
        reached.current.add(depth);
        onScrollDepth(depth);
      });
    },
    [onScroll, onScrollDepth],
  );
  return handleScroll;
}
