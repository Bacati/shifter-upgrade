export default interface TableProps extends astroHTML.JSX.TableHTMLAttributes {
	header?: Array<string | number> | null | undefined
	data?: Array<Array<string | number>> | null | undefined
}
