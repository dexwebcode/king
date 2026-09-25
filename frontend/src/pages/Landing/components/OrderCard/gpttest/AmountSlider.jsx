import { useState } from "react";

import "./AmountSlider.css";

/* Сдержанный ползунок количества. Деления шкалы считаются от максимума
   услуги: 0, ¼, ½, ¾ и максимум — столько же точек на треке. */
export default function AmountSlider({
  min = 0,
  max = 10000,
  step = 1,
  value: controlledValue,
  initialValue,
  onChange,
}) {
  const isControlled = controlledValue !== undefined;
  const [innerValue, setInnerValue] = useState(
    controlledValue ?? initialValue ?? min
  );
  const value = isControlled ? controlledValue : innerValue;

  const range = max - min || 1;
  const percentage = Math.min(
    100,
    Math.max(0, ((value - min) / range) * 100)
  );

  const scaleValues = Array.from({ length: 5 }, (_, index) =>
    Math.round(min + (range * index) / 4)
  );

  const handleChange = (event) => {
    const nextValue = Number(event.target.value);

    if (!isControlled) setInnerValue(nextValue);
    onChange?.(nextValue);
  };

  const formatNumber = (number) =>
    new Intl.NumberFormat("ru-RU").format(number);

  return (
    <div className="amount-slider">
      <div className="amount-slider__track-wrap">
        <div className="amount-slider__track">
          <div
            className="amount-slider__progress"
            style={{ width: `${percentage}%` }}
          />

          <div
            className="amount-slider__thumb"
            style={{ left: `${percentage}%` }}
          />

          <div className="amount-slider__dots">
            {scaleValues.map((_, index) => (
              <span key={index} style={{ left: `${(index / 4) * 100}%` }} />
            ))}
          </div>
        </div>

        {/* Настоящий range поверх */}
        <input
          className="amount-slider__input"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          aria-label="Количество"
        />
      </div>

      <div className="amount-slider__scale">
        {scaleValues.map((scaleValue) => (
          <span key={scaleValue}>{formatNumber(scaleValue)}</span>
        ))}
      </div>
    </div>
  );
}
