import { useState, useEffect } from 'react'
import './BorderlessTable.scss'

function BorderlessTable({
    columns,
    className,
    columnStyling,
    rowCount,
    dataExtractor,
    headerExtractor
}) {
    return (
        <div className='borderless-table-component-wrapper'>
            <table className={`borderless-table-component ${className ?? ""}`}>
                <thead>
                    <tr>
                        {
                            columns.map((column, columnIndex) => (
                                <th
                                    key={typeof column === 'string' ? column : columnIndex}
                                    className='text-style-label-medium'
                                    style={columnStyling ? columnStyling(columnIndex, column) || {} : {}}
                                >
                                    {headerExtractor ? headerExtractor(columnIndex, column) : column}
                                </th>
                            ))
                        }
                    </tr>
                </thead>
                <tbody>
                    {
                        [...Array(rowCount).keys()].map((rowIndex) =>
                            <tr key={rowIndex}>
                                {
                                    columns.map((column, columnIndex) => 
                                        <td
                                            key={`${rowIndex}-${typeof column === 'string' ? column : columnIndex}`}
                                            className='text-style-label-normal'
                                            style={columnStyling ? columnStyling(columnIndex, column) || {} : {}}
                                        >
                                            {dataExtractor(rowIndex, columnIndex, column)}
                                        </td>
                                    )
                                }
                            </tr>
                        )
                    }
                </tbody>
            </table>
        </div>
    )
}

export default BorderlessTable;