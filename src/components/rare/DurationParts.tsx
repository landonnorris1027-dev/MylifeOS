/*! Adapted from Rare UI Duration Picker, Copyright (c) 2026 Swami Malode.
 * https://rareui.com/components/durationpicker
 * MIT + Commons Clause + Attribution; see THIRD_PARTY_NOTICES.md. */
'use client'

import { Slot } from '@radix-ui/react-slot'
import { getSvgPath } from 'figma-squircle'
import { motion, useMotionValue, useSpring, useTransform, type MotionStyle, type MotionValue } from 'motion/react'
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import useMeasure from 'react-use-measure'



const PEN_PATH = 'M3.78181 16.3092L3 21L7.69086 20.2182C8.50544 20.0825 9.25725 19.6956 9.84119 19.1116L20.4198 8.53288C21.1934 7.75922 21.1934 6.5049 20.4197 5.73126L18.2687 3.58024C17.495 2.80658 16.2406 2.80659 15.4669 3.58027L4.88841 14.159C4.30447 14.7429 3.91757 15.4947 3.78181 16.3092Z'
const TICK_PATH = 'M7.959 20.513L1.592 12.872L3.128 11.592L8.041 17.487L20.947 3.587L22.413 4.948L7.959 20.513Z'

const OPEN_GAP = 8
const CORNER_RADIUS = 12
const GAP_SPRING = { stiffness: 200, damping: 28, mass: 1 }
const ICON_SPRING = { stiffness: 200, damping: 28 }
const WIDTH_SPRING = { stiffness: 250, damping: 31 }
const SWAY_SPRING = { stiffness: 200, damping: 24 }
const ERROR_SPRING = { stiffness: 700, damping: 9 }

type SquircleSegmentProps = {
    asChild?: boolean
    cornerSmoothing?: number
    leftRadius: number | MotionValue<number>
    rightRadius: number | MotionValue<number>
    className?: string
    style?: MotionStyle
    children: React.ReactNode
}

const MotionSlot = motion.create(Slot)

const radiusValue = (radius: number | MotionValue<number>) =>
    typeof radius === 'number' ? radius : radius.get()

export const SquircleSegment = ({ asChild, cornerSmoothing = 1, leftRadius, rightRadius, className, style, children }: SquircleSegmentProps) => {
    const Component = asChild ? MotionSlot : motion.div
    const [ref, bounds] = useMeasure({ offsetSize: true })
    const width = useMotionValue(0)
    const height = useMotionValue(0)

    useEffect(() => {
        width.set(bounds.width)
        height.set(bounds.height)
    }, [bounds.width, bounds.height, width, height])

    const clipPath = useTransform(() => {
        const w = width.get()
        const h = height.get()
        if (w <= 0 || h <= 0) {
            return 'none'
        }
        const left = radiusValue(leftRadius)
        const right = radiusValue(rightRadius)
        const path = getSvgPath({
            width: w,
            height: h,
            topLeftCornerRadius: left,
            bottomLeftCornerRadius: left,
            topRightCornerRadius: right,
            bottomRightCornerRadius: right,
            cornerSmoothing,
        })
        return `path('${path}')`
    })

    return (
        <Component data-slot="duration-picker-segment" ref={ref} className={className} style={{ ...style, clipPath }}>
            {children}
        </Component>
    )
}

type DurationFieldProps = {
    label: string
    value: string
    onValueChange: (value: string) => void
    max: number
    isEditing: boolean
    shouldReduceMotion: boolean
    disabled?: boolean
    swayX: MotionValue<number>
    inputRef?: React.RefObject<HTMLInputElement>
}

export const DurationField = ({ value, onValueChange, max, isEditing, shouldReduceMotion, disabled, swayX, inputRef, label }: DurationFieldProps) => {
    const measureRef = useRef<HTMLSpanElement>(null)
    const [textWidth, setTextWidth] = useState(0)
    const errorX = useSpring(0, ERROR_SPRING)
    const x = useTransform(() => swayX.get() + errorX.get())

    useLayoutEffect(() => {
        if (measureRef.current) {
            setTextWidth(measureRef.current.offsetWidth)
        }
    }, [value])

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const next = event.target.value
        if (next !== '' && (Number(next) > max || Number(next) < 0)) {
            onValueChange(String(Math.min(max, Math.max(0, Number(next)))))
            if (!shouldReduceMotion) {
                errorX.jump(6)
                errorX.set(0)
            }
            return
        }
        onValueChange(next)
    }

    const collapsedWidth = Math.max(textWidth + 12, 22)

    return (
        <>
            <motion.input
                data-slot="duration-picker-input"
                ref={inputRef}
                type="number"
                aria-label={label}
                min={0}
                max={max}
                step={1}
                inputMode="numeric"
                tabIndex={isEditing ? 0 : -1}
                value={value}
                onChange={handleChange}
                placeholder={isEditing ? '' : '0'}
                readOnly={!isEditing}
                disabled={disabled}
                style={{ x, width: isEditing ? 36 : collapsedWidth }}
                animate={{ width: isEditing ? 36 : collapsedWidth }}
                transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', ...WIDTH_SPRING }}
                className='rare-duration-input bg-transparent h-full text-center font-semibold text-black dark:text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
            />
            <span ref={measureRef} aria-hidden className="invisible absolute whitespace-pre font-semibold">{value || '0'}</span>
        </>
    )
}


export { PEN_PATH, TICK_PATH, OPEN_GAP, CORNER_RADIUS, GAP_SPRING, ICON_SPRING, SWAY_SPRING };
