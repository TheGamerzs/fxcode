// Adopted from @coder/logger

/**
 * Numeric log level. A higher number is higher severity.
 */
export enum Level {
	Trace,
	Debug,
	Info,
	Warn,
	Error,
}

/**
 * A message field.
 */
export class Field<T> {
	public constructor(public readonly identifier: string, public readonly value: T) { }

	public toJSON(): { identifier: string; value: T } {
		return {
			identifier: this.identifier,
			value: this.value,
		}
	}
}

/**
 * A time field.
 */
export class Time {
	public constructor(public readonly expected: number, public readonly ms: number) { }
}

/**
 * A generic argument to log alongside a message.
 */
export type Argument = any // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * `undefined` is allowed to make it easier to conditionally display a field.
 * For example: `error && field("error", error)`
 */
export type FieldArray = Array<Field<Argument> | undefined>

/**
 * Functions can be used to remove the need to perform operations when the
 * logging level won't output the result anyway.
 */
export type LogCallback = () => [string, ...FieldArray]

/**
 * Log how long something took. Call this before doing the thing then pass it
 * into the logger after finished to log the time it took.
 */
export const time = (expected: number): Time => {
	return new Time(expected, Date.now())
}

/**
 * A field to show with the message.
 */
export const field = <T>(name: string, value: T): Field<T> => {
	return new Field(name, value)
}

/**
 * Represents a log message, its fields, level, and color.
 */
export type Message = {
	message: string | LogCallback
	fields?: FieldArray
	level: Level
	tagColor: string
}

/**
 * An extra function to call with a message.
 */
export type Extender = (msg: Message & { section?: string }) => void

/**
 * Represents a message formatted for use with something like `console.log`.
 */
export type MessageFormat = {
	/**
	 * For example, something like `[%s] %s`.
	 */
	format: ""
	/**
	 * The arguments that get applied to the format string.
	 */
	args: string[]
	/**
	 * The fields to add under the message.
	 */
	fields: Field<Argument>[]
}

export function doLog(level: Level, ...args: Argument): void {
	switch (level) {
		case Level.Trace:
			return console.trace(...args)
		case Level.Debug:
			return console.debug(...args)
		case Level.Info:
			return console.info(...args)
		case Level.Warn:
			return console.warn(...args)
		case Level.Error:
			return console.error(...args)
	}
}

/**
 * Format and build a *single* log entry at a time.
 */
export abstract class Formatter {
	private message: MessageFormat

	private readonly minimumTagWidth = 5

	/**
	 * formatType is used for the strings returned from style() and reset().
	 */
	public constructor(
		private readonly formatType: string = "%s",
		private readonly colors: boolean = true,
	) {
		this.message = this.newMessage()
	}

	/**
	 * Return a new/empty message.
	 */
	private newMessage(): MessageFormat {
		return {
			format: "",
			args: [],
			fields: [],
		}
	}

	/**
	 * Add a tag.
	 */
	public tag(name: string, color: string): void {
		for (let i = name.length; i < this.minimumTagWidth; ++i) {
			name += " "
		}
		this.push(name + " ", color)
	}

	/**
	 * Add a field or an argument. Arguments will display inline in the order they
	 * were pushed. Fields will display differently based on the formatter. Fields
	 * cannot have custom colors.
	 */
	public push(fields: Field<Argument>[]): void
	public push(arg: Argument, color?: string, weight?: string): void
	public push(arg: Argument | Field<Argument>[], color?: string, weight?: string): void {
		if (Array.isArray(arg) && arg.every((a) => a instanceof Field)) {
			return void this.message.fields.push(...arg)
		}
		if (this.colors && (color || weight)) {
			this.message.format += `${this.formatType}${this.getType(arg)}${this.formatType}`
			this.message.args.push(this.style(color, weight), arg, this.reset())
		} else {
			this.message.format += `${this.getType(arg)}`
			this.message.args.push(arg)
		}
	}

	/**
	 * Write everything out and reset state.
	 */
	public write(level: Level): void {
		const message = this.flush()
		this.doWrite(level, message)
	}

	/**
	 * Return current values and reset state.
	 */
	protected flush(): MessageFormat {
		const message = this.message
		this.message = this.newMessage()
		return message
	}

	/**
	 * Return a string that applies the specified color and weight.
	 */
	protected abstract style(color?: string, weight?: string): string

	/**
	 * Return a string that resets all styles.
	 */
	protected abstract reset(): string

	/**
	 * Write everything out.
	 */
	protected abstract doWrite(level: Level, message: MessageFormat): void

	/**
	 * Get the format string for the value type.
	 */
	private getType(arg: Argument): string {
		switch (typeof arg) {
			case "object":
				return "%o"
			case "number":
				return "%d"
			default:
				return "%s"
		}
	}
}

/**
 * Display logs in the browser using CSS in the output. Fields are displayed on
 * individual lines within a group.
 */
export class BrowserFormatter extends Formatter {
	public constructor() {
		super("%c")
	}

	protected style(color?: string, weight?: string): string {
		return (color ? `color: ${color};` : "") + (weight ? `font-weight: ${weight};` : "")
	}

	protected reset(): string {
		return this.style("inherit", "normal")
	}

	public doWrite(level: Level, message: MessageFormat): void {
		console.groupCollapsed(message.format, ...message.args)
		message.fields.forEach((field) => {
			this.push(field.identifier, "#3794ff", "bold")
			if (
				typeof field.value !== "undefined" &&
				field.value.constructor &&
				field.value.constructor.name
			) {
				this.push(` (${field.value.constructor.name})`)
			}
			this.push(": ")
			this.push(field.value)
			const m = this.flush()
			doLog(level, m.format, ...m.args)
		})
		console.groupEnd()
	}
}

/**
 * Display logs on the command line using ANSI color codes. Fields are displayed
 * in a single stringified object inline.
 */
export class ServerFormatter extends Formatter {
	public constructor() {
		super("%s", !!process.stdout.isTTY)
	}

	protected style(color?: string, weight?: string): string {
		return (weight === "bold" ? "\u001B[1m" : "") + (color ? this.hex(color) : "")
	}

	protected reset(): string {
		return "\u001B[0m"
	}

	private hex(hex: string): string {
		const [r, g, b] = this.hexToRgb(hex)
		return `\u001B[38;2;${r};${g};${b}m`
	}

	private hexToRgb(hex: string): [number, number, number] {
		const integer = parseInt(hex.substr(1), 16)
		return [(integer >> 16) & 0xff, (integer >> 8) & 0xff, integer & 0xff]
	}

	protected doWrite(level: Level, message: MessageFormat): void {
		if (message.fields.length === 0) {
			return doLog(level, "[%s] " + message.format, new Date().toISOString(), ...message.args)
		}
		const obj: { [key: string]: Argument } = {}
		message.fields.forEach((field) => (obj[field.identifier] = field.value))
		doLog(
			level,
			"[%s] " + message.format + " %s%s%s",
			new Date().toISOString(),
			...message.args,
			this.style("#8c8c8c"),
			JSON.stringify(obj),
			this.reset(),
		)
	}
}

export class Logger {
	public level = Level.Info

	private readonly nameColor?: string
	private muted = false

	public constructor(
		private _formatter: Formatter,
		private readonly name?: string,
		private readonly defaultFields?: FieldArray,
		private readonly extenders: Extender[] = [],
	) {
		if (name) {
			this.nameColor = this.hashStringToColor(name)
		}
		if (typeof process !== "undefined" && typeof process.env !== "undefined") {
			switch (process.env.LOG_LEVEL) {
				case "trace":
					this.level = Level.Trace
					break
				case "debug":
					this.level = Level.Debug
					break
				case "info":
					this.level = Level.Info
					break
				case "warn":
					this.level = Level.Warn
					break
				case "error":
					this.level = Level.Error
					break
			}
		}
	}

	public set formatter(formatter: Formatter) {
		this._formatter = formatter
	}

	/**
	 * Supresses all output
	 */
	public mute(): void {
		this.muted = true
	}

	public extend(extender: Extender): void {
		this.extenders.push(extender)
	}

	public info(fn: LogCallback): void
	public info(message: string, ...fields: FieldArray): void
	public info(message: LogCallback | string, ...fields: FieldArray): void {
		this.handle({
			message,
			fields,
			tagColor: "#008FBF",
			level: Level.Info,
		})
	}

	public warn(fn: LogCallback): void
	public warn(message: string, ...fields: FieldArray): void
	public warn(message: LogCallback | string, ...fields: FieldArray): void {
		this.handle({
			message,
			fields,
			tagColor: "#FF9D00",
			level: Level.Warn,
		})
	}

	public trace(fn: LogCallback): void
	public trace(message: string, ...fields: FieldArray): void
	public trace(message: LogCallback | string, ...fields: FieldArray): void {
		this.handle({
			message,
			fields,
			tagColor: "#888888",
			level: Level.Trace,
		})
	}

	public debug(fn: LogCallback): void
	public debug(message: string, ...fields: FieldArray): void
	public debug(message: LogCallback | string, ...fields: FieldArray): void {
		this.handle({
			message,
			fields,
			tagColor: "#84009E",
			level: Level.Debug,
		})
	}

	public error(fn: LogCallback): void
	public error(message: string, ...fields: FieldArray): void
	public error(message: LogCallback | string, ...fields: FieldArray): void {
		this.handle({
			message,
			fields,
			tagColor: "#B00000",
			level: Level.Error,
		})
	}

	/**
	 * Returns a sub-logger with a name.
	 * Each name is deterministically generated a color.
	 */
	public named(name: string, ...fields: FieldArray): Logger {
		const l = new Logger(this._formatter, name, fields, this.extenders)
		if (this.muted) {
			l.mute()
		}
		return l
	}

	private handle(message: Message): void {
		if (this.level > message.level || this.muted) {
			return
		}

		let passedFields = message.fields || []
		if (typeof message.message === "function") {
			const values = message.message()
			message.message = values.shift() as string
			passedFields = values as FieldArray
		}

		const fields = (this.defaultFields
			? passedFields.filter((f) => !!f).concat(this.defaultFields)
			: passedFields.filter((f) => !!f)) as Array<Field<Argument>>

		const now = Date.now()
		let times: Array<Field<Time>> = []
		const hasFields = fields && fields.length > 0
		if (hasFields) {
			times = fields.filter((f) => f.value instanceof Time)
			this._formatter.push(fields)
		}

		this._formatter.tag(Level[message.level].toLowerCase(), message.tagColor)
		if (this.name && this.nameColor) {
			this._formatter.tag(this.name, this.nameColor)
		}
		this._formatter.push(message.message)
		if (times.length > 0) {
			times.forEach((time) => {
				const diff = now - time.value.ms
				const expPer = diff / time.value.expected
				const min = 125 * (1 - expPer)
				const max = 125 + min
				const green = expPer < 1 ? max : min
				const red = expPer >= 1 ? max : min
				this._formatter.push(` ${time.identifier}=`, "#3794ff")
				this._formatter.push(
					`${diff}ms`,
					this.rgbToHex(red > 0 ? red : 0, green > 0 ? green : 0, 0),
				)
			})
		}

		this._formatter.write(message.level)

		this.extenders.forEach((extender) => {
			extender({
				section: this.name,
				...message,
			})
		})
	}

	/**
	 * Hashes a string.
	 */
	private djb2(str: string): number {
		let hash = 5381
		for (let i = 0; i < str.length; i++) {
			hash = (hash << 5) + hash + str.charCodeAt(i) /* hash * 33 + c */
		}
		return hash
	}

	private rgbToHex(r: number, g: number, b: number): string {
		const integer =
			((Math.round(r) & 0xff) << 16) + ((Math.round(g) & 0xff) << 8) + (Math.round(b) & 0xff)
		const str = integer.toString(16)
		return "#" + "000000".substring(str.length) + str
	}

	/**
	 * Generates a deterministic color from a string using hashing.
	 */
	private hashStringToColor(str: string): string {
		const hash = this.djb2(str)
		return this.rgbToHex((hash & 0xff0000) >> 16, (hash & 0x00ff00) >> 8, hash & 0x0000ff)
	}
}

export const logger = new Logger(
	typeof process === "undefined" || typeof process.stdout === "undefined"
		? new BrowserFormatter()
		: new ServerFormatter(),
)
