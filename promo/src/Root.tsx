import React from 'react';
import {Composition} from 'remotion';
import {CiroTour} from './Main';
import {TOTAL} from './shots';

export const Root: React.FC = () => {
  return (
    <Composition
      id="CiroTour"
      component={CiroTour}
      durationInFrames={TOTAL}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
