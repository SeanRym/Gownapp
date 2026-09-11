/**
 * Bottom-tab "Fitting Room" — same as web /fitting-room (scan, size, style, try-on).
 * Not the saved-gowns cart (/cart).
 */
import { FittingStudioInner } from "./FittingStudioScreen";

export function FittingRoomTabScreen(props) {
  const route = {
    ...props.route,
    params: { ...props.route?.params, tabRoot: true },
  };
  return <FittingStudioInner {...props} route={route} />;
}
