import { Slider as BaseSlider } from "@base-ui/react/slider";
import * as styles from "./slider.css.ts";

export interface SliderProps {
    value?: number;
    defaultValue?: number;
    onValueChange?: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    className?: string;
    ariaLabel?: string;
}

export function Slider({
    value,
    defaultValue,
    onValueChange,
    min = 0,
    max = 100,
    step = 1,
    disabled,
    className,
    ariaLabel,
}: SliderProps) {
    const handleChange = (newValue: number | number[]) => {
        if (!onValueChange) return;
        onValueChange(Array.isArray(newValue) ? newValue[0] : newValue);
    };

    return (
        <BaseSlider.Root
            value={value}
            defaultValue={defaultValue}
            onValueChange={handleChange}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            className={className}
        >
            <BaseSlider.Control className={styles.root}>
                <BaseSlider.Track className={styles.track}>
                    <BaseSlider.Indicator className={styles.indicator} />
                    <BaseSlider.Thumb
                        className={styles.thumb}
                        aria-label={ariaLabel}
                    />
                </BaseSlider.Track>
            </BaseSlider.Control>
        </BaseSlider.Root>
    );
}
