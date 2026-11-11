'use client';

// Same markup as TableRow, but takes only the fields it renders.
export default function TableRowLean({
  name,
  category,
  sku,
  price,
  stock,
  status,
  rating,
  reviewCount,
}) {
  return (
    <tr className="table-row">
      <td className="table-cell" data-column="name">
        <div className="product-name-cell">
          <span className="product-name">{name}</span>
          <span className="product-category">{category}</span>
        </div>
      </td>
      <td className="table-cell" data-column="sku">
        {sku}
      </td>
      <td className="table-cell" data-column="category">
        {category}
      </td>
      <td className="table-cell" data-column="price">
        <span className="price">${price}</span>
      </td>
      <td className="table-cell" data-column="stock">
        {stock}
      </td>
      <td className="table-cell" data-column="status">
        {status}
      </td>
      <td className="table-cell" data-column="rating">
        <span className="rating">
          <span className="star">&#9733;</span> {rating}
          <span className="review-count">({reviewCount})</span>
        </span>
      </td>
    </tr>
  );
}
