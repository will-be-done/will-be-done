import { StyleSheet, useWindowDimensions } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

// Mirrors the web's two blurred orbs: an 800px blue-600/8 orb centered on the
// top edge and a 600px indigo-500/6 orb past the bottom-right corner. Radial
// gradients stand in for the CSS blur.
export function BackgroundOrbs() {
  const { width, height } = useWindowDimensions();
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="orb-top" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="rgb(37,99,235)" stopOpacity="0.08" />
          <Stop offset="0.7" stopColor="rgb(37,99,235)" stopOpacity="0.05" />
          <Stop offset="1" stopColor="rgb(37,99,235)" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="orb-bottom" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="rgb(99,102,241)" stopOpacity="0.06" />
          <Stop offset="0.7" stopColor="rgb(99,102,241)" stopOpacity="0.04" />
          <Stop offset="1" stopColor="rgb(99,102,241)" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx={width / 2} cy={0} r={520} fill="url(#orb-top)" />
      <Circle
        cx={width + 100}
        cy={height + 100}
        r={400}
        fill="url(#orb-bottom)"
      />
    </Svg>
  );
}
