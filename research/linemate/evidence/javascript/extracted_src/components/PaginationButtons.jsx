import React from 'react';

import './PaginationButtons.scss'
import './App.scss'

import GlobalContext from './GlobalContext';
import Button from './Button';

/**
 * Props:
 * - page: int
 * - increment: int
 * - max: int
 * - onUpdate (newPage: int)
 */
class PaginationButtons extends React.Component {

    static contextType = GlobalContext

    render() {
        return (
          <div className="pagination-buttons">
            <div className="pagination-buttons-button">
              <Button
                icon="assets/chevron-left.svg"
                type="secondary"
                enabled={this.props.page > 0}
                onClick={() => this.props.onUpdate(Math.max(0, this.props.page - 1))}
              />
            </div>
            <div className="pagination-buttons-button">
              <Button
                icon="assets/chevron-right.svg"
                type="secondary"
                enabled={this.props.page < this.props.max / this.props.increment - 1}
                onClick={() => {
                    const newPage = Math.min(
                      this.props.page + 1,
                      Math.floor(this.props.max / this.props.increment)
                    )
                    this.props.onUpdate(newPage)
                }}
              />
            </div>
          </div>
        )
    }

}

export default PaginationButtons;