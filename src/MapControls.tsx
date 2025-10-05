import {
  ReactNode,
  createContext,
  useContext,
  useState,
  useCallback
} from 'react';
import { MapControls as BaseMapControls } from '@react-three/drei';

export type MapControlsContextValue =
  | undefined
  | {
      isEnabled: boolean;
      enableCamera: () => void;
      disableCamera: () => void;
    };

export const MapControlsContext = createContext<MapControlsContextValue>(
  undefined
);
MapControlsContext.displayName = 'MapControlsContext';

export interface MapControlsProps {
  children: ReactNode;
}

export const MapControls = ({ children }: MapControlsProps): JSX.Element => {
  const [isEnabled, setIsEnabled] = useState(true);

  const handleEnableCamera = useCallback(() => setIsEnabled(true), []);
  const handleDisableCamera = useCallback(() => setIsEnabled(false), []);

  const context = {
    isEnabled,
    enableCamera: handleEnableCamera,
    disableCamera: handleDisableCamera
  };

  return (
    <>
      <MapControlsContext.Provider value={context}>
        {children}
      </MapControlsContext.Provider>
      <BaseMapControls enabled={isEnabled} />
    </>
  );
};

export const useMapControls = () => {
  const context = useContext(MapControlsContext);

  if (!context) {
    throw `MapControls context is undefined. Please make sure to call useMapControls as a child of <MapControls>.`;
  }

  return context;
};
