'use client';

import React from 'react';
import RouteResultsSection from './components/RouteResultsSection';
import RouteSearchPanel from './components/RouteSearchPanel';
import { useRouteSearch } from './hooks/useRouteSearch';

const RoutePage = () => {
  const {
    vehicle,
    setVehicle,
    origin,
    setOrigin,
    destination,
    setDestination,
    loading,
    loadError,
    appliedFilters,
    metricsByKey,
    metricsLoading,
    vehicleTypes,
    origins,
    destinations,
    displayRows,
    swap,
    handleSearch,
  } = useRouteSearch();

  return (
    <div>
      <RouteSearchPanel
        vehicle={vehicle}
        origin={origin}
        destination={destination}
        vehicleTypes={vehicleTypes}
        origins={origins}
        destinations={destinations}
        onVehicleChange={setVehicle}
        onOriginChange={setOrigin}
        onDestinationChange={setDestination}
        onSwap={swap}
        onSearch={handleSearch}
      />

      <RouteResultsSection
        show={Boolean(appliedFilters)}
        loading={loading}
        loadError={loadError}
        rows={displayRows}
        metricsByKey={metricsByKey}
        metricsLoading={metricsLoading}
      />
    </div>
  );
};

export default RoutePage;

