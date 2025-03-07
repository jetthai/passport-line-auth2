/**
 * `LineAuthorizationError` error.
 *
 * LineAuthorizationError represents an error in response to an
 * authorization request on Line.
 *
 * References:
 *   - https://devdocs.line.me/en/#error-responses
 *
 * @constructor
 * @param {string} [message]
 * @param {number} [code]
 * @access public
 */
export class LineAuthorizationError extends Error {
	public readonly status: number = 500;

	constructor(
		public readonly message: string,
		public readonly code: number,
	) {
		super(message);
	}
}
