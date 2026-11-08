import React from 'react';

import './Table.scss'
import './App.scss'


/**
 * Props
 * - columns: [string]
 * - columnStyling: fn(columnIndex, columnName)
 * - rowCount: int
 * - dataExtractor: fn(rowIndex, columIndex, columName)
 * - headerClickHandler: fn(columnName) - optional
 * - sortColumn: string - optional, column name being sorted
 * - sortDirection: 'asc' | 'desc' - optional
 */
class Table extends React.Component {

  render() {
    return (
        <div className='table-component-wrapper'>
            <table className={`table-component ${this.props.className || ""}`}>
                <thead>
                    <tr>
                    {
                        this.props.columns.map((column, columnIndex) => {
                            const isSorted = this.props.sortColumn === column;
                            const sortIndicator = isSorted 
                                ? (this.props.sortDirection === 'asc' ? ' ↑' : ' ↓')
                                : '';
                            
                            return (
                                <th 
                                    key={column} 
                                    className='text-style-caption-medium' 
                                    style={this.props.columnStyling ? this.props.columnStyling(columnIndex, column) || {} : {}}
                                    onClick={() => this.props.headerClickHandler && this.props.headerClickHandler(column)}
                                >
                                    {this.props.columnLabelFormatter ? this.props.columnLabelFormatter(column) : column}{sortIndicator}
                                </th>
                            );
                        })
                    }
                    </tr>
                </thead>
                <tbody>
                {
                    [...Array(this.props.rowCount).keys()].map((rowIndex) =>
                        // Tehnically using index as key is discouraged but not sure what else to use here
                        <tr key={rowIndex}>
                            {
                                this.props.columns.map((column, columnIndex) => 
                                    <td key={`${rowIndex}-${column}`} className='text-style-label-tabular-medium' style={this.props.columnStyling ? this.props.columnStyling(columnIndex, column) || {} : {}}>
                                        {
                                            this.props.dataExtractor(rowIndex, columnIndex, column)
                                        }
                                    </td>
                                )
                            }
                        </tr>
                    )
                }
                </tbody>
            </table>
        </div>
    );
  }
}

export default Table;