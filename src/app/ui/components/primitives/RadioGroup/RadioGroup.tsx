import * as styles from "./radioGroup.css.ts";

export type RadioOption = {
    value: string;
    label: string;
};

export type RadioGroupProps = {
    name: string;
    value: string;
    options: RadioOption[];
    onValueChange: (value: string) => void;
    className?: string;
};

function joinClassNames(...classNames: Array<string | undefined>) {
    return classNames.filter(Boolean).join(" ");
}

export function RadioGroup({
    name,
    value,
    options,
    onValueChange,
    className,
}: RadioGroupProps) {
    return (
        <div
            className={joinClassNames(styles.root, className)}
            role="radiogroup"
        >
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <label key={option.value} className={styles.option}>
                        <input
                            type="radio"
                            name={name}
                            value={option.value}
                            checked={selected}
                            onChange={() => onValueChange(option.value)}
                            className={styles.hiddenInput}
                        />
                        <span
                            className={styles.control}
                            data-selected={selected}
                            aria-hidden="true"
                        />
                        <span className={styles.label}>{option.label}</span>
                    </label>
                );
            })}
        </div>
    );
}
