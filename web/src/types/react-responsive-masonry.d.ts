declare module 'react-responsive-masonry' {
    import * as React from 'react';

    export interface MasonryProps {
        children?: React.ReactNode;
        columnsCount?: number;
        gutter?: string;
        className?: string;
        style?: React.CSSProperties;
    }

    export interface ResponsiveMasonryProps {
        children?: React.ReactNode;
        columnsCountBreakPoints?: Record<number, number>;
        className?: string;
        style?: React.CSSProperties;
    }

    export default class Masonry extends React.Component<MasonryProps> { }
    export class ResponsiveMasonry extends React.Component<ResponsiveMasonryProps> { }
}
