declare module 'react-d3-cloud' {
  import * as React from 'react';

  export interface WordData {
    text: string;
    value: number;
    [key: string]: any;
  }

  export interface WordCloudProps {
    data: WordData[];
    width?: number;
    height?: number;
    font?: string | ((word: WordData) => string);
    fontSize?: number | ((word: WordData) => number);
    rotate?: number | ((word: WordData) => number);
    padding?: number;
    spiral?: 'archimedean' | 'rectangular';
    random?: () => number;
    fill?: string | ((word: WordData) => string);
    onWordClick?: (event: any, d: WordData) => void;
    onWordMouseOver?: (event: any, d: WordData) => void;
    onWordMouseOut?: (event: any, d: WordData) => void;
    minAngle?: number;
    maxAngle?: number;
  }

  const WordCloud: React.FC<WordCloudProps>;
  export default WordCloud;
}
