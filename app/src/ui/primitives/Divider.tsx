import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';

import { layoutTokens } from '../../config/layout';

type Props = ViewProps & {
  orientation?: 'horizontal' | 'vertical';
  spacing?: keyof typeof layoutTokens.spacing;
};

export function Divider({ orientation = 'horizontal', spacing, style, ...rest }: Props) {
  return (
    <View
      {...rest}
      style={[
        orientation === 'horizontal' ? styles.horizontal : styles.vertical,
        spacing !== undefined &&
          (orientation === 'horizontal'
            ? { marginVertical: layoutTokens.spacing[spacing] }
            : { marginHorizontal: layoutTokens.spacing[spacing] }),
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  horizontal: { height: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  vertical: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
});
